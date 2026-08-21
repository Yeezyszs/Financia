/** Single-user por enquanto: o middleware injeta o user_id em toda request. */
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export {};
