const BTN_MAPPERS = {
  quick_reply: (b) => ({
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({ display_text: b.displayText, id: b.id }),
  }),
  cta_url: (b) => ({
    name: "cta_url",
    buttonParamsJson: JSON.stringify({
      display_text: b.displayText,
      url: b.url,
      merchant_url: b.url,
    }),
  }),
  cta_copy: (b) => ({
    name: "cta_copy",
    buttonParamsJson: JSON.stringify({
      display_text: b.displayText,
      copy_code: b.id,
    }),
  }),
  single_select: (b) => ({
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title: b.displayText,
      sections: b.sections || [],
    }),
  }),
};

export const sendButton = async (
  sock,
  jid,
  title,
  body,
  footer,
  buttons = [],
) => {
  try {
    const isGroup = jid.endsWith("@g.us");
    const processedButtons = buttons
      .map((b) => BTN_MAPPERS[b.name]?.(b))
      .filter(Boolean);

    const interactivePayload = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: {
            header: { title: title || "", hasMediaAttachment: false },
            body: { text: body || "" },
            footer: { text: footer || "" },
            nativeFlowMessage: {
              buttons: processedButtons,
              messageParamsJson: JSON.stringify({
                bottom_sheet: { in_thread_buttons_limit: 4 },
              }),
            },
          },
        },
      },
    };

    const msgId =
      sock.generateMessageID?.() ||
      `YENVY_BTN_${Math.random().toString(36).slice(2).toUpperCase()}`;

    const additionalNodes = [
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: { type: "native_flow", v: "1" },
            content: [
              { tag: "native_flow", attrs: { v: "9", name: "mixed" } },
            ],
          },
        ],
      },
      ...(!isGroup ? [{ tag: "bot", attrs: { biz_bot: "1" } }] : []),
    ];

    await sock.relayMessage(jid, interactivePayload, {
      messageId: msgId,
      additionalNodes,
    });
    return msgId;
  } catch (err) {
    console.error("[BUTTON ERROR]", err);
    try {
      const fallback = buttons.map((b) => {
        if (b.name === "quick_reply")
          return `• *${b.displayText}* -> ketik: ${b.id}`;
        if (b.name === "cta_url")
          return `• *${b.displayText}* -> Link: ${b.url}`;
        if (b.name === "cta_copy")
          return `• *${b.displayText}* -> Salin: ${b.id}`;
        return `• *${b.displayText}*`;
      });
      return await sock.sendMessage(jid, {
        text: `*${title || "INFO"}*\n\n${body}\n\n${fallback.join("\n")}\n\n_${footer || ""}_`,
      });
    } catch (fe) {
      console.error("[BUTTON FALLBACK ERROR]", fe);
    }
  }
};
