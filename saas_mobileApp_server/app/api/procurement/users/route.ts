import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthenticatedUser(request);
        if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const adminSupabase = createAdminClient();

        // Fetch users from organization_memberships with procurement/org_admin role
        const { data: orgMemberships, error: orgError } = await adminSupabase
            .from('organization_memberships')
            .select(`
                user_id,
                user:users!user_id(id, full_name, email, user_photo_url),
                role
            `)
            .in('role', ['procurement', 'org_super_admin', 'master_admin'])
            .eq('is_active', true);

        if (orgError) {
            console.error('Error fetching procurement users:', orgError);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        const userMap = new Map<string, any>();

        if (orgMemberships) {
            orgMemberships.forEach((m: any) => {
                if (m.user && !userMap.has(m.user_id)) {
                    const u = m.user;
                    userMap.set(m.user_id, {
                        id: u.id,
                        full_name: u.full_name,
                        email: u.email,
                        user_photo_url: u.user_photo_url,
                        role: m.role,
                    });
                }
            });
        }

        return NextResponse.json(Array.from(userMap.values()));
    } catch (error) {
        console.error('[Procurement Users GET] API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
