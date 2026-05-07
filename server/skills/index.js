'use strict';

const fs = require('fs');
const path = require('path');

// Auto-load all skill files in this directory
const skills = [];
const skillDir = __dirname;

for (const file of fs.readdirSync(skillDir)) {
  if (file === 'index.js' || !file.endsWith('.js')) continue;
  const skill = require(path.join(skillDir, file));
  if (skill.name && skill.keywords && skill.promptContent) {
    skills.push(skill);
  }
}

/**
 * Match skills relevant to the conversation based on message content.
 * Scans the last few user messages for keyword matches.
 *
 * @param {Array} messages - conversation messages [{role, content}]
 * @returns {Array} matched skill objects
 */
function matchSkills(messages) {
  // Look at the last 3 user messages for context
  const recentUserMessages = messages
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content.toLowerCase())
    .join(' ');

  const matched = new Set();

  for (const skill of skills) {
    for (const kw of skill.keywords) {
      if (recentUserMessages.includes(kw.toLowerCase())) {
        matched.add(skill);
        break;
      }
    }
  }

  return Array.from(matched);
}

/**
 * Build the skill-specific portion of the system prompt.
 *
 * @param {Array} messages - conversation messages
 * @returns {string} domain knowledge text to append to system prompt
 */
function getSkillPrompt(messages) {
  const matched = matchSkills(messages);
  if (matched.length === 0) return '';

  const sections = matched.map(s => s.promptContent).join('\n\n');
  return `\n\n## Active Domain Knowledge\n\nThe following domain knowledge has been loaded based on the current conversation:\n\n${sections}`;
}

/**
 * @returns {Array} list of all available skills with name and description
 */
function listSkills() {
  return skills.map(s => ({ name: s.name, description: s.description }));
}

module.exports = { matchSkills, getSkillPrompt, listSkills, skills };
