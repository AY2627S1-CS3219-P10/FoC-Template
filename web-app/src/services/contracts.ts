// HTTP contracts from the user-service and supplier-service response DTOs.
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

export interface PickupLocation {
  id: string;
  supplierAtLocation: string;
  building: string;
  floor: number;
  locationDescription: string;
  latitude: number;
  longitude: number;
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
