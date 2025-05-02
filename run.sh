#!/bin/bash
export PORT=4422

git pull
npm i
node index.js >/dev/null 2>&1 &
