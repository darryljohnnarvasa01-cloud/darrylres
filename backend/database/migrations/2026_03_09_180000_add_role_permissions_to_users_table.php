<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('role_permissions')->nullable()->after('status');
        });

        DB::table('users')
            ->where('role', 'admin')
            ->update([
                'role_permissions' => json_encode([
                    'manage-users' => true,
                    'manage-incidents' => true,
                    'view-analytics' => true,
                    'manage-iot' => true,
                    'broadcast-messages' => true,
                ]),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role_permissions');
        });
    }
};
