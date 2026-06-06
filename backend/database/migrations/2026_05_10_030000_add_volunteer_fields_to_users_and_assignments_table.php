<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('is_volunteer')->default(false)->index();
            $table->jsonb('volunteer_skills')->nullable();
            $table->boolean('volunteer_availability')->default(false)->index();
        });

        Schema::table('incident_assignments', function (Blueprint $table): void {
            $table->boolean('is_volunteer')->default(false)->index();
        });
    }

    public function down(): void
    {
        Schema::table('incident_assignments', function (Blueprint $table): void {
            $table->dropIndex(['is_volunteer']);
            $table->dropColumn('is_volunteer');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['is_volunteer']);
            $table->dropIndex(['volunteer_availability']);
            $table->dropColumn([
                'is_volunteer',
                'volunteer_skills',
                'volunteer_availability',
            ]);
        });
    }
};
