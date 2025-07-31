const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const parsedArgs = {
        version: null,
        debug: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            parsedArgs.help = true;
        } else if (arg === '--debug') {
            parsedArgs.debug = true;
        } else if (arg.startsWith('--version=')) {
            parsedArgs.version = arg.split('=')[1];
        } else if (arg === '--version' && i + 1 < args.length) {
            parsedArgs.version = args[i + 1];
            i++; // Skip the next argument as it's already used
        }
    }

    return parsedArgs;
}

// Display help information
function showHelp() {
    console.log(`
Changelog Generation Script
--------------------------
Generates a changelog for the eclipse-theia/theia repository.

Usage: node changelog_generation.js --version 1.36.0 [--debug]

Parameters:
  --version <version>   The version number for the changelog (required)
  --debug               Enable verbose logging (default: false)
  --help, -h            Display this help information

Environment Variables Required:
  GITHUB_TOKEN          GitHub API token for authentication
  OPENAI_API_KEY        OpenAI API key for ChatGPT requests
`);
}

// Get and validate arguments
const args = parseArgs();
if (args.help) {
    showHelp();
    process.exit(0);
}

if (!args.version) {
    console.error('Error: Missing required parameter --version');
    showHelp();
    process.exit(1);
}

// Set parameters from arguments with defaults
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OWNER = 'eclipse-theia';
const REPO = 'theia';
const VERSION = args.version;
const DEBUG = args.debug;

// Check for required environment variables
if (!GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    process.exit(1);
}

if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
}

function divider() {
    if (DEBUG) {
        console.log('----------------------------------------------');
    }
}

function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

// Fetch the milestone number by title (version)
async function fetchMilestoneNumberByTitle(version) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/milestones?state=all&per_page=100`;
    const response = await fetch(url, {
        headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    if (!response.ok) {
        throw new Error(`Error fetching milestones: ${response.status} ${response.statusText}`);
    }
    const milestones = await response.json();
    const milestone = milestones.find(m => m.title === version);
    if (!milestone) {
        throw new Error(`Milestone with title '${version}' not found.`);
    }
    return milestone.number;
}

// Fetch PRs in a specific milestone
async function fetchPRsInMilestone(version) {
    const milestoneNumber = await fetchMilestoneNumberByTitle(version);
    let prs = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
        const url = `https://api.github.com/repos/${OWNER}/${REPO}/issues?milestone=${milestoneNumber}&state=closed&per_page=100&page=${page}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        if (!response.ok) {
            throw new Error(`Error fetching issues for milestone: ${response.status} ${response.statusText}`);
        }
        const issues = await response.json();
        // Only keep PRs (issues with pull_request field)
        const prsOnPage = issues.filter(issue => issue.pull_request && issue.pull_request.url);
        prs = prs.concat(prsOnPage);
        hasMore = issues.length === 100;
        page++;
    }
    // Fetch full PR details for each PR (to get merged_at, title, body, etc.)
    const prDetails = await Promise.all(prs.map(async issue => {
        const prUrl = `https://api.github.com/repos/${OWNER}/${REPO}/pulls/${issue.number}`;
        const prResponse = await fetch(prUrl, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        if (!prResponse.ok) {
            throw new Error(`Error fetching PR #${issue.number}: ${prResponse.status} ${prResponse.statusText}`);
        }
        return await prResponse.json();
    }));
    // Only include merged PRs
    return prDetails.filter(pr => pr.merged_at !== null);
}


// Fetch changed files for a specific PR
async function fetchChangedFiles(prNumber) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/pulls/${prNumber}/files`;
    const response = await fetch(url, {
        headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    if (!response.ok) {
        throw new Error(`Error fetching changed files for PR ${prNumber}: ${response.status} ${response.statusText}`);
    }
    return await response.json();
}

// Updated helper function for looking up a GitHub user by their email that handles 403 errors gracefully
async function getUserByEmail(email) {
    const url = `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`;
    const response = await fetch(url, {
        headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    if (response.status === 403) {
        debugLog(`403 Forbidden: Cannot search user by email ${email}. This endpoint is restricted by GitHub API policies.`);
        return null;
    }
    if (!response.ok) {
        debugLog(`Error searching user by email ${email}: ${response.status} ${response.statusText}`);
        return null;
    }
    const data = await response.json();
    return data.total_count > 0 && data.items.length > 0 ? data.items[0].login : null;
}

// Updated function for calculating contributors (now asynchronous)
async function getContributors(prCommitsLists) {
    const contributors = new Set();
    // Regex now captures both name and email from coauthor lines
    const coauthorRegex = /Co-authored-by:\s*(.+?)\s*<([^>]+)>/gi;
    const lookupPromises = [];

    prCommitsLists.forEach(commits => {
        commits.forEach(commit => {
            // Only add the primary author if commit.author exists (no fallback)
            if (commit.author && commit.author.login) {
                contributors.add(`@${commit.author.login}`);
            }
            // Process coauthors from the commit message
            if (commit.commit && commit.commit.message) {
                let match;
                while ((match = coauthorRegex.exec(commit.commit.message)) !== null) {
                    const coauthorEmail = match[2].trim();
                    // Lookup the coauthor's GitHub login by their email
                    const promise = getUserByEmail(coauthorEmail)
                        .then(login => {
                            if (login) {
                                contributors.add(`@${login}`);
                            }
                        })
                        .catch(err => {
                            console.error(`Error looking up coauthor with email ${coauthorEmail}:`, err);
                        });
                    lookupPromises.push(promise);
                }
            }
        });
    });

    await Promise.all(lookupPromises);
    return Array.from(contributors);
}

// Fetch the existing CHANGELOG.md file content
async function fetchExistingChangelog() {
    try {
        const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/CHANGELOG.md`;
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });

        if (!response.ok) {
            throw new Error(`Error fetching CHANGELOG.md: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return content;
    } catch (error) {
        console.error('Error fetching existing changelog:', error);
        return '';
    }
}

// Extract existing entries for the current version from the changelog
function extractExistingEntries(changelogContent, version) {
    const regularEntries = [];
    const breakingEntries = [];

    if (!changelogContent) {
        return { regularEntries, breakingEntries };
    }

    // Find the section for the current version
    const versionRegex = new RegExp(`## ${version}.*?\\n((?:.|\\n)*?)(?:\\n## |$)`, 'm');
    const versionMatch = changelogContent.match(versionRegex);

    if (!versionMatch || !versionMatch[1]) {
        debugLog(`No existing entries found for version ${version}`);
        return { regularEntries, breakingEntries };
    }

    const versionContent = versionMatch[1].trim();

    // Split into regular changes and breaking changes
    const breakingChangesRegex = new RegExp(`<a name="breaking_changes_${version}".*?\\n((?:.|\\n)*?)(?:\\n## |$)`, 'm');
    const breakingChangesMatch = versionContent.match(breakingChangesRegex);

    if (breakingChangesMatch && breakingChangesMatch[1]) {
        // Extract breaking changes
        const breakingChangesContent = breakingChangesMatch[1].trim();
        const breakingLines = breakingChangesContent.split('\n');

        breakingLines.forEach(line => {
            if (line.trim().startsWith('- ')) {
                breakingEntries.push(line.trim().substring(2)); // Remove the "- " prefix
            }
        });
    }

    // Extract regular changes (excluding the breaking changes section)
    let regularContent = versionContent;
    if (breakingChangesMatch) {
        regularContent = versionContent.substring(0, versionContent.indexOf('<a name="breaking_changes_')).trim();
    }

    const regularLines = regularContent.split('\n');
    regularLines.forEach(line => {
        if (line.trim().startsWith('- ')) {
            regularEntries.push(line.trim().substring(2)); // Remove the "- " prefix
        }
    });

    debugLog(`Found ${regularEntries.length} regular entries and ${breakingEntries.length} breaking entries for version ${version}`);

    return { regularEntries, breakingEntries };
}

// Check if a PR entry already exists in the changelog
function entryExistsInChangelog(prNumber, entries) {
    const prLink = `[#${prNumber}](https://github.com/eclipse-theia/theia/pull/${prNumber})`;
    return entries.some(entry => entry.includes(prLink));
}

// Function to validate and normalize a changelog entry format using ChatGPT
async function validateChangelogEntry(entry) {
    try {
        // ChatGPT API endpoint
        const url = 'https://api.openai.com/v1/chat/completions';

        // System instructions for validating changelog entries
        const systemPrompt = `
You are a specialized assistant for validating and normalizing changelog entries for Eclipse Theia.

## Input
You will receive a changelog entry that may or may not follow the correct format.

## Task
Validate the entry format and normalize it if needed while preserving the original meaning.

## Correct Format Requirements
Each changelog entry should follow this structure:
- [component] title [#github-pr-number](https://github.com/eclipse-theia/theia/pull/github-pr-number)
- [component] title [#github-pr-number](https://github.com/eclipse-theia/theia/pull/github-pr-number) - attribution

## Formatting Rules
1. Title must start with a lowercase letter
2. Title must be in past tense
3. The component should be in square brackets
4. The PR number should be in the correct format

## Response
Return ONLY the normalized changelog entry without any explanations or additional text.
DO NOT change the meaning or the PR number of the entry.
If the entry is already correct, just return it as-is.
`;

        // Make API request to ChatGPT
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: entry }
                ],
                temperature: 0.3 // Lower temperature for more predictable outputs
            })
        });

        if (!response.ok) {
            throw new Error(`ChatGPT API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const normalizedEntry = data.choices[0].message.content.trim();

        // If the entry was normalized, log it
        if (normalizedEntry !== entry && DEBUG) {
            debugLog(`Normalized changelog entry:\nOriginal: ${entry}\nNormalized: ${normalizedEntry}`);
        }

        return normalizedEntry;
    } catch (error) {
        console.error(`Error validating changelog entry:`, error);
        // Return the original entry if validation fails
        return entry;
    }
}

// Function to get structured changelog data from ChatGPT
async function getChangelogDataFromChatGPT(prObject) {
    try {
        // ChatGPT API endpoint
        const url = 'https://api.openai.com/v1/chat/completions';

        // System instructions with detailed requirements
        const systemPrompt = `
You are a specialized assistant for generating changelog entries for Eclipse Theia pull requests.

## Input
You will receive a PR object with title, number, body fields, and a list of changed files in JSON format.

## Task
Analyze the PR content and create a structured output with:
1. A meaningful changelog message following the format guidelines below
2. A boolean flag indicating if this is a breaking change

## Changelog Format Requirements
Each changelog entry should follow this structure:
- [component] title [#github-pr-number](https://github.com/eclipse-theia/theia/pull/github-pr-number)
- [component] title [#github-pr-number](https://github.com/eclipse-theia/theia/pull/github-pr-number) - attribution

## Formatting Rules
1. Title must start with a lowercase letter
2. Title must be in past tense
3. Entries are sorted first by component, then by title

## Component Identification
Determine the component based on the changed files paths:
1. Look at each changed file path
2. Extract the second path fragment after splitting by '/' (e.g., packages/core/src/foo.ts -> 'core')
3. Use the most frequent or most relevant component from the changed files
4. Common components include: core, plugin, workspace, terminal, output, navigator, preferences, etc.
5. There should only be one component. The one being used the most.

## Breaking Change Detection
A PR is only considered to contain breaking changes if:
1. The "Breaking changes" checkbox is explicitly checked in the PR body
2. Look for "- [x]" or "- [X]" in the Breaking changes section
3. Do NOT mark as breaking unless this is explicitly indicated

## Attribution Extraction
Look for an "Attribution" section in the PR body to include any attribution information.

## Response Format
Respond with a JSON object containing:
- changelogMessage: the formatted changelog entry following the requirements
- isBreaking: boolean indicating if this contains breaking changes (be strict about this)

Example output:
{
  "changelogMessage": "[core] fixed an issue with workspace loading [#1234](https://github.com/eclipse-theia/theia/pull/1234) - contributed on behalf of Company X",
  "isBreaking": false
}
`;

        // Make API request to ChatGPT
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(prObject) }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`ChatGPT API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);

        return {
            changelogMessage: result.changelogMessage,
            isBreaking: result.isBreaking
        };
    } catch (error) {
        console.error(`Error getting changelog data from ChatGPT for PR ${prObject.number}:`, error);
        // Return default values in case of error
        return {
            changelogMessage: `[unknown] ${prObject.title} [${prObject.number}](https://github.com/eclipse-theia/theia/pull/${prObject.number.replace('#', '')})`,
            isBreaking: false
        };
    }
}

// Function to extract component from changelog message for sorting
function extractComponent(message) {
    const match = message.match(/\[([^\]]+)\]/);
    return match ? match[1].toLowerCase() : '';
}

// Function to extract title from changelog message for sorting
function extractTitle(message) {
    const match = message.match(/\[[^\]]+\]\s+(.*?)\s+\[#/);
    return match ? match[1].toLowerCase() : '';
}

// Function to format date as MM/DD/YYYY
function formatDate(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

async function main() {
    try {
        // Fetch existing changelog content
        debugLog('Fetching existing changelog content...');
        const existingChangelog = await fetchExistingChangelog();

        // Extract existing entries for the current version
        debugLog(`Extracting existing entries for version ${VERSION}...`);
        const { regularEntries: existingRegularEntries, breakingEntries: existingBreakingEntries } =
            extractExistingEntries(existingChangelog, VERSION);

        // Normalize existing entries to ensure proper format
        debugLog('Normalizing existing entries...');
        const normalizedRegularEntries = await Promise.all(
            existingRegularEntries.map(entry => validateChangelogEntry(entry))
        );

        const normalizedBreakingEntries = await Promise.all(
            existingBreakingEntries.map(entry => validateChangelogEntry(entry))
        );

        // Fetch PRs in the milestone matching the version
        debugLog(`Fetching PRs in milestone '${VERSION}'...`);
        const prs = await fetchPRsInMilestone(VERSION);
        divider();
        debugLog(`Found ${prs.length} merged PRs in milestone '${VERSION}'`);

        // Fetch changed files for each PR and create enhanced PR objects
        const prObjects = [];
        for (const pr of prs) {
            const prNumber = pr.number.toString();

            // Skip if this PR is already in the changelog
            if (entryExistsInChangelog(prNumber, [...normalizedRegularEntries, ...normalizedBreakingEntries])) {
                debugLog(`PR #${prNumber} already in changelog, skipping...`);
                continue;
            }

            try {
                // Fetch changed files for this PR
                const changedFiles = await fetchChangedFiles(prNumber);

                // Create enhanced PR object with title, number, body, and changed files
                const prObject = {
                    title: pr.title,
                    number: prNumber, // Store as number without # for API calls
                    body: pr.body,
                    changedFiles: changedFiles.map(file => file.filename)
                };

                prObjects.push(prObject);
                debugLog(`Processed PR #${prNumber}: ${pr.title} (${changedFiles.length} files changed)`);
            } catch (error) {
                console.error(`Error processing PR #${prNumber}:`, error);
            }
        }

        // Process each PR object with ChatGPT to get structured changelog data
        const changelogDataPromises = prObjects.map(prObject => {
            // Make sure the number is properly formatted for the changelog entry
            const prObjectForChangelog = {
                ...prObject,
                number: `#${prObject.number}` // Add # for the changelog entry
            };
            return getChangelogDataFromChatGPT(prObjectForChangelog);
        });

        const changelogDataResults = await Promise.all(changelogDataPromises);

        // Display the enhanced PR objects with changelog data if in debug mode
        if (DEBUG) {
            divider();
            debugLog("PRs with changelog data:");
            changelogDataResults.forEach((data, index) => {
                debugLog(`PR #${prObjects[index].number} - ${prObjects[index].title}`);
                debugLog(`Changed Files: ${prObjects[index].changedFiles.join(', ')}`);
                debugLog(`PR Body:\n${prObjects[index].body || 'No body provided'}\n`);
                debugLog(`Changelog Message: ${data.changelogMessage}`);
                debugLog(`Breaking Change: ${data.isBreaking ? 'Yes' : 'No'}`);
                debugLog('---');
            });
        }

        // Combine existing entries with new ones
        const regularChanges = [...normalizedRegularEntries];
        const breakingChanges = [...normalizedBreakingEntries];

        changelogDataResults.forEach(data => {
            // Extract the message content from the entry (without the leading "- ")
            const message = data.changelogMessage.startsWith('- ')
                ? data.changelogMessage.substring(2)
                : data.changelogMessage;

            if (data.isBreaking) {
                breakingChanges.push(message);
            } else {
                regularChanges.push(message);
            }
        });

        // Sort both arrays by component and then by title
        const sortByComponentAndTitle = (a, b) => {
            const componentA = extractComponent(a);
            const componentB = extractComponent(b);

            if (componentA !== componentB) {
                return componentA.localeCompare(componentB);
            }

            return extractTitle(a).localeCompare(extractTitle(b));
        };

        regularChanges.sort(sortByComponentAndTitle);
        breakingChanges.sort(sortByComponentAndTitle);

        // Get today's date in MM/DD/YYYY format
        const today = new Date();
        const formattedDate = formatDate(today);

        // Format the changelog output
        divider();
        console.log(`\n## ${VERSION} - ${formattedDate}\n`);

        regularChanges.forEach(change => {
            console.log(`- ${change}`);
        });

        if (breakingChanges.length > 0) {
            console.log(`\n<a name="breaking_changes_${VERSION}">[Breaking Changes:](#breaking_changes_${VERSION})</a>\n`);

            breakingChanges.forEach(change => {
                console.log(`- ${change}`);
            });
        }

        // Get all the contributors (including coauthors) that had commits in this milestone
        const prCommitsPromises = prs.map(pr => {
            const prNumber = pr.number.toString();

            return fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pulls/${prNumber}/commits`, {
                headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`Error fetching commits for PR ${prNumber}: ${response.status} ${response.statusText}`);
                }
                return response.json();
            });
        });

        const prCommitsLists = await Promise.all(prCommitsPromises);

        const contributors = await getContributors(prCommitsLists);
        // Sort contributors alphabetically
        contributors.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        // Always output contributors regardless of debug mode
        console.log("\nContributors:");
        console.log(contributors.join(', '));

    } catch (error) {
        console.error('An error occurred:', error);
    }
}

main();
