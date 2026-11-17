import { html } from '../utils/format.js';
import { avatar } from '../utils/avatar.js';

/** "Buenos días", "Buenas tardes" or "Buenas noches" according to the time of the device. */
export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Welcome banner at the top of the main screens: photo, greeting with the first name,
 * title and subtitle of the section, and its actions (a button, the search box…).
 */
export function welcomeBanner({ user, apiUrl, title, subtitle, actions = '' }) {
  const firstName = user.name.split(' ')[0];
  return html`
<section class="welcome">
  ${avatar(user, apiUrl, { size: 56, className: 'welcome-avatar' })}
  <div class="welcome-text">
    <p class="welcome-greeting">${greeting()}, ${firstName}</p>
    <h1>${title}</h1>
    <p class="subtitle">${subtitle}</p>
  </div>
  <div class="welcome-actions">${actions}</div>
</section>`;
}
