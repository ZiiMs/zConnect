export interface Session {
  user: { id: string; email: string }
}

export type GetSession = (req: Request) => Promise<Session | null>
