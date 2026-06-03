web: bash -c "([ -e cassandra ] || ln -sf . cassandra) && echo '[start] cassandra symlink ready' && exec uvicorn orchestrator.api_server:app --host 0.0.0.0 --port ${PORT:-8001}"
