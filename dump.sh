#!/bin/sh

### BEGIN INIT INFO
# Provides:          dump
# Required-Start:    $remote_fs $syslog
# Required-Stop:     $remote_fs $syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Example initscript
# Description:       This service is used to manage a servo
### END INIT INFO

DUMP1090=/home/pi/dump1090
OPTS="--net"

case "$1" in
start)	cd $DUMP1090
        screen -S dump1090 -d -m -L $DUMP1090/dump1090 $OPTS >> /dev/null
	;;
restart) $0 stop
	$0 start
	;;
stop)	screen -r dump1090 -X quit
	;;
esac
exit 0
