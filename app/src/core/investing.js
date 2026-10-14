// @ts-check
/* The only place Stack says anything about WHAT to invest in. suggest() (stages.js) only decides HOW MUCH.
   Keep it general. If Stack is ever shared with other people, specific picks (a fund, an ETF, a platform)
   could count as personal financial advice in Australia, so this file is the one to review or strip. */

/** Shown in suggestions once you reach stage 4. */
export const INVESTING_TIP = {
  title: 'Investing, kept simple',
  body: 'Low-fee, diversified index funds bought automatically every pay are the usual starting point. Fees and consistency matter more than picking winners.',
};

/** Printed under suggestions and at the foot of Plan. */
export const DISCLAIMER = 'General information, not financial advice.';
