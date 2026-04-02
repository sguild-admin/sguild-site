export type SquareErrorResponse = {
  errors?: Array<{
    category?: string;
    code?: string;
    detail?: string;
  }>;
};

export type SquareCustomer = {
  id: string;
  nickname?: string;
  given_name?: string;
  family_name?: string;
  email_address?: string;
  phone_number?: string;
};

export type SquareCard = {
  id: string;
  card_brand?: string;
  last_4?: string;
  exp_month?: number;
  exp_year?: number;
  cardholder_name?: string;
  enabled?: boolean;
};

export type SquareInvoice = {
  id?: string;
  status?: string;
  version?: number;
  order_id?: string;
  public_url?: string;
};
