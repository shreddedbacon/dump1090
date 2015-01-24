#!/bin/bash
START=95
INSTALLDIR=/home/pi/dump1090

start() {
    screen -S dump1090 -d -m -L $INSTALLDIR/dump1090 --net >> /dev/null
}

stop() {
    screen -r dump1090 -X quit
}

