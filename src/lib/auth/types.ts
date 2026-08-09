export type AdminSessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  sectors?: Array<{
    key: string;
    name: string;
    role: string;
    canReview: boolean;
    canApprove: boolean;
    isPrimary: boolean;
  }>;
};
