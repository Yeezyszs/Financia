export interface UserProps {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

export class User {
  constructor(private readonly props: UserProps) {}

  get id(): string { return this.props.id; }
  get email(): string { return this.props.email; }
  get name(): string | null { return this.props.name; }
  get createdAt(): Date { return this.props.createdAt; }
}
