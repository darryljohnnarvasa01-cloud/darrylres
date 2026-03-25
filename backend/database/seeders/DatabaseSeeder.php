<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->upsertUser([
            'full_name' => 'CDRRMO Admin',
            'email' => 'admin@rescuelink.test',
            'password' => 'password123',
            'phone' => '09170000000',
            'address' => 'CDRRMO Office, Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'admin',
            'status' => 'verified',
            'role_permissions' => User::defaultAdminPermissions(),
        ]);

        $this->upsertUser([
            'full_name' => 'CDRRMO Staff 1',
            'email' => 'staff1@rescuelink.test',
            'password' => 'password123',
            'phone' => '09171111111',
            'address' => 'Valencia City',
            'barangay' => 'Poblacion',
            'role' => 'staff',
            'status' => 'verified',
        ]);

        $this->upsertUser([
            'full_name' => 'CDRRMO Staff 2',
            'email' => 'staff2@rescuelink.test',
            'password' => 'password123',
            'phone' => '09172222222',
            'address' => 'Valencia City',
            'barangay' => 'Lumbo',
            'role' => 'staff',
            'status' => 'verified',
        ]);
    }

    /**
     * @param  array<string, string>  $payload
     */
    private function upsertUser(array $payload): void
    {
        User::query()->updateOrCreate(
            ['email' => $payload['email']],
            [
                'full_name' => $payload['full_name'],
                'password' => Hash::make($payload['password']),
                'phone' => $payload['phone'],
                'address' => $payload['address'],
                'barangay' => $payload['barangay'],
                'role' => $payload['role'],
                'status' => $payload['status'],
                'role_permissions' => $payload['role_permissions'] ?? null,
            ]
        );
    }
}
