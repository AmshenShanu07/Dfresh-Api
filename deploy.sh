pm2 kill
pm2 start "node --max-old-space-size=2048 ./dist/main.js" --name api