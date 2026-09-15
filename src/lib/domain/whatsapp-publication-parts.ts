import type { WhatsAppActionButtonInput } from '../communication/connectyhub-client';

type PublicationContent = {
  caption: string; mediaUrl: string; buttonText: string;
  actionButton?: WhatsAppActionButtonInput;
  auctionButtonText?: string; auctionActionButton?: WhatsAppActionButtonInput;
};

/** Preserve delivery part identities, including legacy campaigns without an auction block. */
export function whatsappPublicationParts(input: PublicationContent) {
  const kinds = input.auctionActionButton
    ? [...(input.mediaUrl ? ['media'] : []), 'text', ...(input.actionButton ? ['buttons'] : [])]
    : input.mediaUrl ? ['media', ...(input.actionButton ? ['buttons'] : [])] : ['text'];
  return kinds.map(kind => {
    const auctionPart = kind === 'text' && Boolean(input.auctionActionButton);
    return {
      kind,
      imageUrl: kind === 'media' ? input.mediaUrl : '',
      text: kind === 'media' ? input.caption : auctionPart
        ? [input.mediaUrl ? '' : input.caption, input.auctionButtonText || 'Link do leilão'].filter(Boolean).join('\n\n')
        : kind === 'buttons' ? input.buttonText : input.caption,
      actionButton: kind === 'media' ? undefined : auctionPart ? input.auctionActionButton : input.actionButton,
    };
  });
}
