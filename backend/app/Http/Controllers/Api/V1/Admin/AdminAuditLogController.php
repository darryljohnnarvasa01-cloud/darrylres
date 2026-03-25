<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminAuditLogController extends Controller
{
    use ApiResponse;

    public function index(Request $request): StreamedResponse|\Illuminate\Http\JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'user_id' => ['nullable', 'uuid'],
            'action_type' => ['nullable', 'string', 'max:120'],
            'incident_id' => ['nullable', 'uuid'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'format' => ['nullable', 'in:csv'],
        ]);

        if ($validator->fails()) {
            return $this->errorResponse('Validation failed.', $validator->errors()->toArray(), 422);
        }

        $validated = $validator->validated();
        $query = AuditLog::query()
            ->with([
                'user:id,full_name,role',
                'incident:id,reference_code',
            ])
            ->orderByDesc('created_at');

        if (! empty($validated['user_id'])) {
            $query->where('user_id', $validated['user_id']);
        }

        if (! empty($validated['action_type'])) {
            $query->where('action_type', $validated['action_type']);
        }

        if (! empty($validated['incident_id'])) {
            $query->where('incident_id', $validated['incident_id']);
        }

        if (! empty($validated['from'])) {
            $query->where('created_at', '>=', Carbon::parse($validated['from'])->startOfDay());
        }

        if (! empty($validated['to'])) {
            $query->where('created_at', '<=', Carbon::parse($validated['to'])->endOfDay());
        }

        if (($validated['format'] ?? null) === 'csv') {
            $logs = $query->get();

            return response()->streamDownload(function () use ($logs): void {
                $handle = fopen('php://output', 'w');

                fputcsv($handle, [
                    'Timestamp',
                    'User',
                    'Role',
                    'Action Type',
                    'Incident ID',
                    'Reference Code',
                    'Entity Type',
                    'Entity ID',
                    'Before State',
                    'After State',
                    'Metadata',
                ]);

                foreach ($logs as $log) {
                    fputcsv($handle, [
                        $log->created_at?->toDateTimeString(),
                        $log->user?->full_name ?? 'System',
                        $log->user?->role ?? '',
                        $log->action_type,
                        $log->incident_id,
                        $log->incident?->reference_code ?? '',
                        $log->entity_type ?? '',
                        $log->entity_id ?? '',
                        json_encode($log->before_state ?? [], JSON_UNESCAPED_SLASHES),
                        json_encode($log->after_state ?? [], JSON_UNESCAPED_SLASHES),
                        json_encode($log->metadata ?? [], JSON_UNESCAPED_SLASHES),
                    ]);
                }

                fclose($handle);
            }, 'rescuelink-audit-logs-'.now()->format('Ymd-His').'.csv', [
                'Content-Type' => 'text/csv',
            ]);
        }

        $logs = $query->paginate($validated['per_page'] ?? 15)->withQueryString();
        $auditUsers = User::query()
            ->whereIn('role', ['admin', 'staff'])
            ->orderBy('full_name')
            ->get(['id', 'full_name', 'role']);
        $actionTypes = AuditLog::query()
            ->select('action_type')
            ->distinct()
            ->orderBy('action_type')
            ->pluck('action_type')
            ->values();

        $logs->getCollection()->transform(function (AuditLog $log) {
            return [
                'id' => $log->id,
                'action_type' => $log->action_type,
                'user' => $log->user
                    ? [
                        'id' => $log->user->id,
                        'full_name' => $log->user->full_name,
                        'role' => $log->user->role,
                    ]
                    : null,
                'incident' => $log->incident
                    ? [
                        'id' => $log->incident->id,
                        'reference_code' => $log->incident->reference_code,
                    ]
                    : ($log->incident_id
                        ? [
                            'id' => $log->incident_id,
                            'reference_code' => null,
                        ]
                        : null),
                'entity_type' => $log->entity_type,
                'entity_id' => $log->entity_id,
                'before_state' => $log->before_state ?? [],
                'after_state' => $log->after_state ?? [],
                'metadata' => $log->metadata ?? [],
                'created_at' => $log->created_at?->toIso8601String(),
            ];
        });

        return $this->successResponse([
            'logs' => $logs,
            'filters' => [
                'users' => $auditUsers,
                'action_types' => $actionTypes,
            ],
        ], 'Audit logs retrieved successfully.');
    }
}
