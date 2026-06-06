<?php

require __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

use App\Models\User;
use App\Models\Role;
use Illuminate\Support\Facades\Hash;

// Get Super Admin role
$superAdmin = Role::where('slug', 'super-admin')->first();

if (!$superAdmin) {
    echo "ERROR: Super Admin role not found!\n";
    exit(1);
}

echo "Super Admin Role ID: {$superAdmin->id}\n";

// Create new admin user. Pass ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_FULL_NAME
// when you want deterministic credentials.
$email = getenv('ADMIN_EMAIL') ?: 'admin2@rescuelink.test';
$password = getenv('ADMIN_PASSWORD') ?: bin2hex(random_bytes(8));
$fullName = getenv('ADMIN_FULL_NAME') ?: 'Second Admin';

// Check if email already exists
$existing = User::where('email', $email)->first();
if ($existing) {
    echo "ERROR: Email {$email} already exists!\n";
    exit(1);
}

// Create the user
$user = User::create([
    'full_name' => $fullName,
    'email' => $email,
    'password' => Hash::make($password),
    'role' => 'admin',
    'status' => 'verified',
    'role_id' => $superAdmin->id,
]);

echo "SUCCESS: Admin user created!\n";
echo "Email: {$email}\n";
echo "Password: {$password}\n";
echo "Role: Super Admin\n";
