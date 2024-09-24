#!/bin/sh
# get changes from modbus2mqtt to github repo
gh repo sync volkmarnissen/server --source modbus2mqtt/server
# copy changes from own repo to local main branch
git checkout main
git pull
# copy changes from local main branch to hassio-addon branch
git checkout hassio-addon
git rebase main