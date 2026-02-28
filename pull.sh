#!/bin/bash
echo "Pulling latest changes from GitHub..."
git config pull.rebase false
git stash
git pull origin main
git stash pop 2>/dev/null
echo ""
echo "Installing any new dependencies..."
npm install --legacy-peer-deps
echo ""
echo "Building web frontend..."
npx expo export --platform web --output-dir dist --clear
echo ""
echo "Done! Restart the app to see your changes."
