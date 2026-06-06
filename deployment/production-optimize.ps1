Set-Location "$PSScriptRoot\..\backend"

php artisan down
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
php artisan queue:restart
php artisan up

Set-Location "$PSScriptRoot\..\frontend"
npm ci
npm run build
