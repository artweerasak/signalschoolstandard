#!/bin/bash
# เริ่ม converter_server.py ใน background แล้วรัน gotenberg ต่อ
python3 /usr/local/bin/converter_server.py &
exec "$@"
