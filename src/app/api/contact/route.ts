import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // TODO: Integrate with Supabase to store leads
    // TODO: Integrate with Mailjet to send confirmation email

    // TODO: Supabase + Mailjet integration

    return NextResponse.json(
      { success: true, message: 'Message reçu' },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
