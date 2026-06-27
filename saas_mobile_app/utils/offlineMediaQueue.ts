import { mmkvAsyncStorage } from './storage';
import * as FileSystem from 'expo-file-system';
import { checklistService } from '@/services/checklistService';
import { processAndStampImage, processVideo } from './mediaProcessor';

export interface OfflineMediaTask {
  id: string;
  localUri: string;
  type: 'photo' | 'video';
  propertyId: string;
  completionId: string;
  completionItemId: string; // The ID of the row in `checklist_completion_items`
  itemId: string;           // The ID of the `checklist_items` template
  timestamp: string; // ISO string
  status: 'pending' | 'processing' | 'failed' | 'completed';
  error?: string;
  retries: number;
}

const QUEUE_KEY = 'autopilot_offline_media_queue';

export const offlineMediaQueue = {
  async getQueue(): Promise<OfflineMediaTask[]> {
    const raw = await mmkvAsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  },

  async saveQueue(queue: OfflineMediaTask[]): Promise<void> {
    await mmkvAsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  async addTask(taskInput: Omit<OfflineMediaTask, 'id' | 'status' | 'retries'>): Promise<OfflineMediaTask> {
    const queue = await this.getQueue();
    
    // Copy the file to a permanent local directory so it's not deleted if temp is cleared
    const fileExt = taskInput.type === 'photo' ? 'webp' : 'mp4'; // Initial assumption, actual ext doesn't matter much for localUri
    const newUri = `${FileSystem.documentDirectory}media_queue_${Date.now()}.${fileExt}`;
    await FileSystem.copyAsync({ from: taskInput.localUri, to: newUri });

    const newTask: OfflineMediaTask = {
      ...taskInput,
      id: `task_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      localUri: newUri,
      status: 'pending',
      retries: 0,
    };

    queue.push(newTask);
    await this.saveQueue(queue);
    
    // Trigger processing asynchronously without blocking
    this.processQueue().catch(console.error);
    
    return newTask;
  },

  async updateTaskStatus(id: string, updates: Partial<OfflineMediaTask>): Promise<void> {
    const queue = await this.getQueue();
    const index = queue.findIndex(t => t.id === id);
    if (index !== -1) {
      queue[index] = { ...queue[index], ...updates };
      await this.saveQueue(queue);
    }
  },

  async removeTask(id: string): Promise<void> {
    const queue = await this.getQueue();
    const task = queue.find(t => t.id === id);
    if (task) {
      try {
        await FileSystem.deleteAsync(task.localUri, { idempotent: true });
      } catch (e) {
        // Ignore file delete errors
      }
    }
    const filtered = queue.filter(t => t.id !== id);
    await this.saveQueue(filtered);
  },

  async removeTaskByItemIdAndType(itemId: string, type: 'photo' | 'video'): Promise<void> {
    const queue = await this.getQueue();
    const task = queue.find(t => t.itemId === itemId && t.type === type);
    if (task) {
      await this.removeTask(task.id);
    }
  },

  _isProcessing: false,

  /**
   * Processes all pending/failed tasks in the background.
   */
  async processQueue(): Promise<void> {
    if (this._isProcessing) return;
    this._isProcessing = true;

    try {
      let queue = await this.getQueue();
      let pendingTasks = queue.filter(t => t.status === 'pending' || (t.status === 'failed' && t.retries < 5));

      for (const task of pendingTasks) {
        await this.updateTaskStatus(task.id, { status: 'processing' });
        
        try {
          // 1. Process / Compress
          let processedUri = task.localUri;
          if (task.type === 'photo') {
            processedUri = await processAndStampImage(task.localUri, task.timestamp);
          } else {
            processedUri = await processVideo(task.localUri);
          }

          // 2. Upload to backend
          const ext = task.type === 'photo' ? 'webp' : 'mp4';
          const fileName = `${task.itemId}-${Date.now()}.${ext}`;
          
          const formData = new FormData();
          formData.append('file', {
            uri: processedUri,
            name: fileName,
            type: task.type === 'photo' ? 'image/webp' : 'video/mp4',
          } as any);
          formData.append('propertyId', task.propertyId);
          formData.append('completionId', task.completionId);
          formData.append('itemId', task.itemId);
          formData.append('type', task.type);

          const res = await checklistService.uploadMedia(formData);
          const publicUrl = res.url;
          const checkedAt = new Date().toISOString();

          // 3. Update checklist completion in DB
          const updateData: any = { checked_at: checkedAt };
          if (task.type === 'photo') updateData.photo_url = publicUrl;
          else updateData.video_url = publicUrl;

          await checklistService.updateCompletion(task.completionId, {
            item: { completionItemId: task.completionItemId, checklist_item_id: task.itemId, ...updateData } as any,
          });

          // 4. Success -> Cleanup
          await this.removeTask(task.id);
          
          // Cleanup processed temp file
          if (processedUri !== task.localUri) {
             await FileSystem.deleteAsync(processedUri, { idempotent: true });
          }

        } catch (err: any) {
          console.warn(`[OfflineQueue] Task ${task.id} failed:`, err);
          await this.updateTaskStatus(task.id, { 
            status: 'failed', 
            error: err.message,
            retries: task.retries + 1 
          });
        }
      }
    } finally {
      this._isProcessing = false;
    }
  }
};
