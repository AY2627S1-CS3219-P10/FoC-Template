// HTTP contracts from the backend service response DTOs.
export interface ErrandOperation {
  operationId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  errand?: Errand;
  errorCode?: string;
}
export interface Errand {
  requesterUsername?: string | null;
  id: string; requesterId: string; courierId: string | null; status: string;
  pickupLocationId: string; pickupSupplierName: string; pickupLocationLabel: string;
  description: string; deliveryDestination: string; instructions: string; offeredCredits: number;
  version: number; createdAt: string; updatedAt: string;
}
export interface CreditBalance {
  userId: string;
  availableCredits: number;
  reservedCredits: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
  isAdmin: boolean;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Authentication {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  user: Pick<Profile, "id" | "username" | "isAdmin">;
}

export const categoryLabels = {
  FOOD: "Food",
  FOOD_COFFEE: "Food & coffee",
  PRINTING: "Printing",
  SHOPPING: "Shopping",
} as const;

export interface CampusLocation {
  id: string;
  building: string;
  latitude: number;
  longitude: number;
}

export interface PickupLocation {
  id: string;
  supplierAtLocation: string;
  building: string;
  floor: number | null;
  locationDescription: string;
  latitude: number | null;
  longitude: number | null;
  opensAt: string;
  closesAt: string;
  isOpenOvernight: boolean;
  imageUrl: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  category: keyof typeof categoryLabels;
  locations: PickupLocation[];
}
