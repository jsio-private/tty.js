#!/bin/bash

template() {
    expr='{while(match($0,"[$]{[^}]*}")) {var=substr($0,RSTART+2,RLENGTH -3);gsub("[$]{"var"}",ENVIRON[var])}}1'

    awk "$expr" < $1 > $2
}

template $PREFIX/etc/wakari/apps/terminal.json.template $PREFIX/etc/wakari/apps/terminal.json
rm $PREFIX/etc/wakari/apps/terminal.json.template
