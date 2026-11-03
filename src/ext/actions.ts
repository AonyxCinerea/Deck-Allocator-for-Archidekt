/** Edits to Archidekt decks. */
import type { PlannedChange } from "../allocation";
import { buildSwitchPatch, type ArchidektSlotRef } from "../archidekt";
import { patchJson } from "./api";
import { invalidateDeck } from "./store";

export async function applyChanges(deckId: string, changes: PlannedChange[]) {
  const body = buildSwitchPatch(
    changes.map((c) => ({
      ref: c.slot.ref as ArchidektSlotRef,
      targetPrintingId: c.target.printingId,
      targetFinish: c.target.finish,
      quantity: c.quantity,
    })),
  );
  if (body.cards.some((c: any) => !c.categories)) throw new Error("Deck data outdated — refresh first");
  await patchJson(`/api/decks/${deckId}/modifyCards/v2/`, body);
  await invalidateDeck(deckId);
  // Archidekt's editor keeps its own state; reload so it shows the new printings.
  location.reload();
}
