'use strict';

const config = require('./config');

/**
 * Pricing table { [modelId]: { input, output } } in USD per 1M tokens.
 * Built from RA_MODEL_<ID>_COST_INPUT / RA_MODEL_<ID>_COST_OUTPUT.
 * Used by the per-user usage endpoint. The admin scraper reads its own
 * pricing.json instead so prices can be edited without per-user env reloads.
 */
function getPricing() {
  const pricing = {};
  for (const m of config.models) {
    if (m.costInput || m.costOutput) {
      pricing[m.id] = { input: m.costInput || 0, output: m.costOutput || 0 };
    }
  }
  return pricing;
}

module.exports = { getPricing };
