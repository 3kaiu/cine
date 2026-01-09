#!/bin/bash

ACTION=$1
APP_ID="cine"
APP_DIR=$(dirname $(cd "$(dirname "$0")"; pwd))
PID_FILE="/var/run/${APP_ID}.pid"
LOG_FILE="/var/log/${APP_ID}.log"
BIN_PATH="${APP_DIR}/app/backend/cine-backend"

start() {
    if [ -f "$PID_FILE" ]; then
        if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "Service is already running"
            exit 0
        else
            rm "$PID_FILE"
        fi
    fi

    # 设置环境变量
    export APP_HOME="${APP_DIR}/app"
    # 如果 config.json 需要指定路径，可以在这里通过参数传递，或者确保后端会在当前目录查找
    cd "${APP_DIR}" # 切换到应用根目录，确保相对路径正确

    nohup "$BIN_PATH" > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Service started with PID $(cat $PID_FILE)"
}

stop() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            # 等待进程结束
            for i in {1..10}; do
                if ! kill -0 "$PID" 2>/dev/null; then
                    rm "$PID_FILE"
                    echo "Service stopped"
                    exit 0
                fi
                sleep 1
            done
            # 强制杀死
            kill -9 "$PID"
            rm "$PID_FILE"
            echo "Service force stopped"
        else
            rm "$PID_FILE"
            echo "Service was effectively stopped (PID file stale)"
        fi
    else
        echo "PID file not found"
    fi
}

status() {
    if [ -f "$PID_FILE" ]; then
        if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "running"
            exit 0
        else
            echo "stopped"
            # 清理过期的 PID 文件
            rm "$PID_FILE"
            exit 1
        fi
    else
        echo "stopped"
        exit 1
    fi
}

case "$ACTION" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        exit 1
        ;;
esac
