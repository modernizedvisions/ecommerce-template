export type EmailListItem = {
  id: string;
  email: string;
  created_at: string;
};

export type EmailListSubscribeResult = {
  ok: boolean;
  alreadySubscribed: boolean;
};

export type AdminEmailListResponse = {
  ok: boolean;
  items: EmailListItem[];
};

