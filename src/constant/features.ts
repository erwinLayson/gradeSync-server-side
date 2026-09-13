// Feature flags — server-side toggles for whole-school features.
// Managed by the developer role via PATCH /features/:key.

export interface FeatureProps {
    key: string;
    label: string;
    description: string | null;
    enabled: boolean;
    updatedBy: number | null;
    updatedAt: string | null;
}

// Map shape consumed by the frontend FeatureFlagProvider (GET /features).
export type FeatureFlagMap = Record<string, boolean>;

// Fields the PATCH endpoint is allowed to change.
export const AllowedFeatureFields = ["enabled"] as const;

export type FeatureUpdateProps = {
    enabled?: boolean;
};
