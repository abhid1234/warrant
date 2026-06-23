// The GROUND TRUTH the verifier probes — an airline reservation system the
// booking agents act on but DO NOT control. The verifier reads this directly;
// the agents only get to report what they claim they did. That gap is the demo.

export interface Reservation {
  pnr: string;
  passenger: string;
  itinerary: string;
  seat: string;
  cabin: string;
}

export interface BookResult {
  ok: boolean;
  pnr?: string;
  error?: string;
}

export class AirlineWorld {
  private store = new Map<string, Reservation>();

  /** Attempt a real booking. With failPayment, nothing is ever written. */
  book(r: Reservation, opts?: { failPayment?: boolean }): BookResult {
    if (opts?.failPayment) return { ok: false, error: "payment declined (card_expired)" };
    this.store.set(r.pnr, { ...r });
    return { ok: true, pnr: r.pnr };
  }

  /** Independent lookup — what the WORLD actually shows. null === not booked. */
  lookup(pnr: string): Reservation | null {
    return this.store.get(pnr) ?? null;
  }
}
