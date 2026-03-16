import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export interface GeneratedQuestion {
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface PushPayload {
  receiver: string;
  title: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}
