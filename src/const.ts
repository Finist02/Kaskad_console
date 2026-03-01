/**
 * @fileoverview Global constants for the Kaskad VS Code extension.
 *
 * This file contains all extension-wide constants that are used across
 * different modules. These constants define the extension's identity,
 * configuration namespace, and other immutable values.
 */

/**
 * The unique identifier for this VS Code extension.
 *
 * This ID must match the publisher.name format in package.json and is used
 * for extension registration, command contributions, and VS Code marketplace identification.
 *
 * @example 'kaskad.my-extension'
 */
export const EXTENSION_ID = 'Danil.kaskad-project-admin';

/**
 * The human-readable display name of the extension.
 *
 * This name appears in the VS Code UI, extension list, and marketplace.
 * It should be descriptive and follow the Kaskad naming convention.
 *
 * @example 'Kaskad My Extension'
 */
export const EXTENSION_NAME = 'Kaskad Project Admin';

/**
 * The configuration section name for this extension's settings.
 *
 * This namespace is used for all VS Code workspace/extension settings.
 * Settings are accessed via `vscode.workspace.getConfiguration(EXTENSION_CONFIG_SECTION)`.
 *
 * @example 'kaskadMyExtension'
 */
export const EXTENSION_CONFIG_SECTION = 'kaskadProjectAdmin';
