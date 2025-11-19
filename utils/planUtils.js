/**
 * Get the world limit for a given plan
 * @param {string} plan - The user's plan (basic, premium, enterprise, starter, growth, studio)
 * @returns {number|null} - The world limit (null for unlimited)
 */
export function getWorldLimit(plan) {
  if (!plan) return 0;
  
  const planLimits = {
    'basic': 1,
    'premium': 3,
    'starter': 1,      // start-plan maps to 'starter'
    'start': 1,        // alternative name
    'growth': 3,       // growth-plan maps to 'growth'
    'studio': 10,      // studio-plan maps to 'studio'
    'enterprise': null // null means unlimited
  };
  
  return planLimits[plan.toLowerCase()] ?? 0;
}

/**
 * Check if a user has reached their world limit
 * @param {string} plan - The user's plan
 * @param {number} currentWorldCount - Current number of worlds
 * @returns {boolean} - True if limit reached
 */
export function hasReachedWorldLimit(plan, currentWorldCount) {
  const limit = getWorldLimit(plan);
  if (limit === null) return false; // Unlimited
  return currentWorldCount >= limit;
}

