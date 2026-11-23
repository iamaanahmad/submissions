// Jira displays the label for the linked end, not the link type name.
// A cause is relevant to handoff only when this issue is caused by the linked work.
export function isBlockingLinkLabel(label) {
  return /^(?:(?:is )?blocked by|(?:is )?depend(?:s|ent) (?:on|upon)|requires?|is caused by)$/i.test(label?.trim() || '');
}
