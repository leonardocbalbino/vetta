import { render, toPlainText } from '@react-email/render';
import { createElement } from 'react';
import { NotificationEmail, type NotificationEmailProps } from './templates/notification-email.js';

export {
  NotificationEmail,
  type EmailBrand,
  type NotificationEmailProps,
} from './templates/notification-email.js';

/** Renderiza o e-mail em HTML e texto puro. */
export async function renderNotificationEmail(
  props: NotificationEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(createElement(NotificationEmail, props));
  return { html, text: toPlainText(html) };
}
