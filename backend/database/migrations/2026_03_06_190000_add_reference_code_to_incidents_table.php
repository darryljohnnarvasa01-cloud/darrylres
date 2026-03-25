<?php

use App\Support\IncidentVerification;
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
        Schema::table('incidents', function (Blueprint $table) {
            $table->string('reference_code')->nullable()->after('id');
        });

        DB::table('incidents')
            ->select('id')
            ->orderBy('created_at')
            ->chunk(200, function ($incidents): void {
                foreach ($incidents as $incident) {
                    DB::table('incidents')
                        ->where('id', $incident->id)
                        ->update([
                            'reference_code' => IncidentVerification::referenceCodeFromId((string) $incident->id),
                        ]);
                }
            });

        Schema::table('incidents', function (Blueprint $table) {
            $table->unique('reference_code');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropUnique('incidents_reference_code_unique');
            $table->dropColumn('reference_code');
        });
    }
};
