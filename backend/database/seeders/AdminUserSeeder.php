<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run()
    {
        // Get Super Admin role
        $superAdmin = Role::where('slug', 'super-admin')->first();

        if (!$superAdmin) {
            $this->command->error('Super Admin role not found!');
            return;
        }

        // Create new admin user. Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_FULL_NAME
        // when running the seeder to choose deterministic credentials.
        $email = env('ADMIN_EMAIL', 'admin2@rescuelink.test');
        $password = env('ADMIN_PASSWORD', bin2hex(random_bytes(8)));
        $fullName = env('ADMIN_FULL_NAME', 'Second Admin');

        // Check if email already exists
        $existing = User::where('email', $email)->first();
        if ($existing) {
            $this->command->error("Email {$email} already exists!");
            return;
        }

        // Create the user
        User::create([
            'full_name' => $fullName,
            'email' => $email,
            'password' => Hash::make($password),
            'phone' => '09123456789',
            'address' => 'Sample Address',
            'barangay' => 'Sample Barangay',
            'role' => 'admin',
            'status' => 'verified',
            'role_id' => $superAdmin->id,
        ]);

        $this->command->info('Admin user created successfully!');
        $this->command->info("Email: {$email}");
        $this->command->info("Password: {$password}");
        $this->command->info('Role: Super Admin');
    }
}
