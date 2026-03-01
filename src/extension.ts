import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectManager } from './projectManager';
import { StatusBarManager } from './statusBarManager';
import { SystemTreeProvider } from './views/systemTreeProvider';
import { SystemItem } from './views/systemTreeProvider';
import { ManagerTreeProvider } from './views/managerTreeProvider';
import type { ProjectInfo, KaskadCoreAPI } from './types';
import type { ManagerDisplayData } from './views/managerTreeProvider';
import { LanguageModelToolsService } from './languageModelTools';

// Type guard to check if projectData is ProjectInfo
function isProjectInfo(projectData: ProjectInfo | string[]): projectData is ProjectInfo {
    return typeof projectData === 'object' && projectData !== null && 'id' in projectData;
}
import { ExtensionOutputChannel } from './extensionOutput';

let projectManager: ProjectManager;
let statusBarManager: StatusBarManager;
let systemTreeProvider: SystemTreeProvider;
let managerTreeProvider: ManagerTreeProvider;
let languageModelToolsService: LanguageModelToolsService;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function hasManagerData(value: unknown): value is { managerData: ManagerDisplayData } {
    if (!isRecord(value)) return false;
    const managerData = value.managerData;
    return isRecord(managerData) && typeof managerData.idx === 'number';
}

function hasProjectData(value: unknown): value is { projectData: ProjectInfo } {
    if (!isRecord(value)) return false;
    const projectData = value.projectData;
    return isRecord(projectData) && typeof projectData.id === 'string';
}

function hasSubprojectPath(value: unknown): value is { subprojectPath: string } {
    if (!isRecord(value)) return false;
    return typeof value.subprojectPath === 'string';
}

export async function activate(context: vscode.ExtensionContext): Promise<KaskadCoreAPI> {
    // Set path overrides from config BEFORE any npm-winccoa-core usage (for Kaskad etc.)
    const config = vscode.workspace.getConfiguration('kaskadProjectAdmin');
    const pvssPath = config.get<string>('pvssInstConfPath', '');
    const installBase = config.get<string>('installationPathBase', '');
    const binPath = config.get<string>('binPath', '');
    const runningCodes = config.get<number[]>('pmonRunningExitCodes', [0]);
    if (pvssPath) {
        process.env.PVSS_INST_CONF_PATH = pvssPath;
        process.env.PVSS_II_ROOT = path.dirname(pvssPath);
    }
    if (installBase) process.env.WINCCOA_INSTALL_BASE = installBase;
    if (binPath) process.env.WINCCOA_BIN_PATH = binPath;
    if (runningCodes.length > 0) process.env.WINCCOA_PMON_RUNNING_CODES = runningCodes.join(',');
    (globalThis as unknown as { __WINCCOA_LOG?: (level: string, msg: string) => void }).__WINCCOA_LOG = (level, msg) => {
        if (level === 'debug') ExtensionOutputChannel.debug('Core', msg);
    };

    // Initialize logger first
    ExtensionOutputChannel.initialize();
    ExtensionOutputChannel.info('Extension', '========== EXTENSION STARTING ==========');

    try {
        ExtensionOutputChannel.info('Extension', 'Activating extension...');

        // Initialize project manager (async, non-blocking)
        ExtensionOutputChannel.info('Extension', 'Creating ProjectManager...');
        projectManager = new ProjectManager(context);

        // Initialize status bar (without initial update)
        ExtensionOutputChannel.info('Extension', 'Creating StatusBarManager...');
        statusBarManager = new StatusBarManager(projectManager, false);

        // Initialize tree view providers immediately (they handle loading state)
        ExtensionOutputChannel.info('Extension', 'Creating TreeView providers...');
        systemTreeProvider = new SystemTreeProvider(projectManager);
        managerTreeProvider = new ManagerTreeProvider(projectManager);

        // Register tree views immediately
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('kaskad.systemView', systemTreeProvider),
        );
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('kaskad.managerView', managerTreeProvider),
        );
        ExtensionOutputChannel.info('Extension', 'TreeView providers registered');

        // Register Language Model Tools for GitHub Copilot
        ExtensionOutputChannel.info('Extension', 'Registering Language Model Tools...');
        languageModelToolsService = new LanguageModelToolsService(
            projectManager,
            systemTreeProvider,
            managerTreeProvider,
        );
        languageModelToolsService.register(context);
        ExtensionOutputChannel.info('Extension', 'Language Model Tools registered');

        // Start background initialization (don't block activation)
        projectManager
            .initialize()
            .then(() => {
                ExtensionOutputChannel.info('Extension', 'Background initialization complete');
                // Update status bar after initialization
                statusBarManager.forceUpdate();
            })
            .catch((err) => {
                const error = err instanceof Error ? err : new Error(String(err));
                ExtensionOutputChannel.error(
                    'Extension',
                    'Background initialization failed',
                    error,
                );
            });

        // Register command for project selection
        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.core.selectProject', async () => {
                await statusBarManager.showProjectPicker();
            }),
        );
        ExtensionOutputChannel.info('Extension', 'Registered selectProject command');

        // Register command for manual project refresh
        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.core.refreshProjects', async () => {
                await projectManager.refreshProjects();
                ExtensionOutputChannel.showInfoNotification('Kaskad projects refreshed');
            }),
        );
        ExtensionOutputChannel.info('Extension', 'Registered refreshProjects command');

        // Register command to show current project info (for testing)
        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.core.showProjectInfo', async () => {
                // Force refresh to get latest data
                await projectManager.refreshProjects();

                const project = projectManager.getCurrentProject();
                if (!project) {
                    vscode.window.showWarningMessage('No project selected');
                    return;
                }

                const info = [
                    `Project: ${project.name}`,
                    `ID: ${project.id}`,
                    `Version: ${project.version}`,
                    `Project Path: ${project.projectDir}`,
                    `Install Dir: ${project.installDir}`,
                    `OA Install Path: ${project.oaInstallPath || 'NOT FOUND'}`,
                    `Config Path: ${project.configPath || 'NOT FOUND'}`,
                    `Running: ${project.isRunning}`,
                ].join('\n');

                vscode.window.showInformationMessage(info, { modal: true });
                ExtensionOutputChannel.info('Extension', `Project Info:\n${info}`);
            }),
        );
        ExtensionOutputChannel.info('Extension', 'Registered showProjectInfo command');

        // Register view refresh commands
        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.systemView.refresh', async () => {
                ExtensionOutputChannel.info(
                    'Extension',
                    '[REFRESH BUTTON] Triggered force refresh for all projects',
                );
                // Force full refresh of all projects
                await projectManager.forceRefreshAll();
                // TreeView will auto-update via onDidChangeProjects event
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.managerView.refresh', () => {
                managerTreeProvider.refresh();
            }),
        );
        ExtensionOutputChannel.info('Extension', 'Registered view refresh commands');

        // Register manager control commands
        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.manager.start', async (item: unknown) => {
                if (hasManagerData(item)) {
                    await managerTreeProvider.startManager(item.managerData);
                }
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.manager.stop', async (item: unknown) => {
                if (hasManagerData(item)) {
                    await managerTreeProvider.stopManager(item.managerData);
                }
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.manager.restart', async (item: unknown) => {
                if (hasManagerData(item)) {
                    await managerTreeProvider.restartManager(item.managerData);
                }
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.manager.delete', async (item: unknown) => {
                if (hasManagerData(item)) {
                    await managerTreeProvider.deleteManager(item);
                }
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.manager.add', async () => {
                await managerTreeProvider.addManager();
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.manager.edit', async (item: unknown) => {
                if (hasManagerData(item)) {
                    await managerTreeProvider.editManager(item);
                }
            }),
        );
        ExtensionOutputChannel.info('Extension', 'Registered manager control commands');

        // Register system control commands
        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.system.start', async () => {
                await systemTreeProvider.startOASystem();
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.system.stop', async () => {
                await systemTreeProvider.stopOASystem();
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.system.restart', async () => {
                await systemTreeProvider.restartOASystem();
            }),
        );
        ExtensionOutputChannel.info('Extension', 'Registered system control commands');

        // Register project control commands
        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.project.start', async (item: unknown) => {
                if (hasProjectData(item)) {
                    await systemTreeProvider.startProject(item.projectData);
                }
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.project.stop', async (item: unknown) => {
                if (hasProjectData(item)) {
                    await systemTreeProvider.stopProject(item.projectData);
                }
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.project.setActive', async (item: unknown) => {
                if (hasProjectData(item)) {
                    await systemTreeProvider.setActiveProject(item.projectData);
                }
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand(
                'kaskad.project.addToWorkspace',
                async (item: unknown) => {
                    if (hasProjectData(item)) {
                        await systemTreeProvider.addProjectToWorkspace(item.projectData);
                    }
                },
            ),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand(
                'kaskad.project.openInExplorer',
                async (item: unknown) => {
                    if (hasProjectData(item)) {
                        await systemTreeProvider.openProjectInExplorer(item.projectData);
                    }
                },
            ),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.project.register', async () => {
                await systemTreeProvider.registerNewProject();
            }),
        );
        ExtensionOutputChannel.info('Extension', 'Registered project control commands');
        // Register project unregister command
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'kaskad.project.unregister',
                async (item: SystemItem) => {
                    if (item && item.projectData && isProjectInfo(item.projectData)) {
                        await systemTreeProvider.unregisterProject(item.projectData);
                    }
                },
            ),
        );
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'kaskad.project.addToFavorites',
                async (item: SystemItem) => {
                    if (item && item.projectData && isProjectInfo(item.projectData)) {
                        const isFav = projectManager.isFavorite(item.projectData.id);
                        if (!isFav) {
                            projectManager.toggleFavorite(item.projectData.id);
                            ExtensionOutputChannel.showInfoNotification(
                                `⭐ Added ${item.projectData.name} to favorites`,
                            );
                        }
                    }
                },
            ),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand(
                'kaskad.project.removeFromFavorites',
                async (item: SystemItem) => {
                    if (item && item.projectData && isProjectInfo(item.projectData)) {
                        const isFav = projectManager.isFavorite(item.projectData.id);
                        if (isFav) {
                            projectManager.toggleFavorite(item.projectData.id);
                            ExtensionOutputChannel.showInfoNotification(
                                `Removed ${item.projectData.name} from favorites`,
                            );
                        }
                    }
                },
            ),
        );
        ExtensionOutputChannel.info('Extension', 'Registered project unregister command');

        // Register project from explorer context menu
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'kaskad.explorer.registerProject',
                async (uri: vscode.Uri) => {
                    if (uri) {
                        await systemTreeProvider.registerProjectFromExplorer(uri);
                    }
                },
            ),
        );
        ExtensionOutputChannel.info('Extension', 'Registered explorer register project command');
        // Register subproject commands
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'kaskad.subproject.addToWorkspace',
                async (item: unknown) => {
                    if (hasSubprojectPath(item)) {
                        await systemTreeProvider.addSubprojectToWorkspace(item.subprojectPath);
                    }
                },
            ),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand(
                'kaskad.subproject.openInExplorer',
                async (item: unknown) => {
                    if (hasSubprojectPath(item)) {
                        await systemTreeProvider.openSubprojectInExplorer(item.subprojectPath);
                    }
                },
            ),
        );
        ExtensionOutputChannel.info('Extension', 'Registered subproject commands');

        // Register utility commands
        context.subscriptions.push(
            vscode.commands.registerCommand('kaskad.openConfig', async () => {
                const project = projectManager.getCurrentProject();
                if (!project) {
                    vscode.window.showErrorMessage('No project selected');
                    return;
                }

                if (project.configPath && fs.existsSync(project.configPath)) {
                    const configUri = vscode.Uri.file(project.configPath);
                    const document = await vscode.workspace.openTextDocument(configUri);
                    await vscode.window.showTextDocument(document);
                    ExtensionOutputChannel.info(
                        'Extension',
                        `Opened config file: ${project.configPath}`,
                    );
                } else {
                    vscode.window.showErrorMessage(`Config file not found: ${project.configPath}`);
                }
            }),
        );

        ExtensionOutputChannel.info('Extension', 'Registered utility commands');

        // Cleanup on dispose
        context.subscriptions.push(projectManager, statusBarManager);

        ExtensionOutputChannel.success('Extension', 'Extension activated successfully');

        // Return public API for other extensions
        return {
            getCurrentProject: () => projectManager.getCurrentProject(),
            setCurrentProject: (projectId: string) => projectManager.setCurrentProject(projectId),
            getRunningProjects: () => Promise.resolve(projectManager.getRunningProjects()),
            onDidChangeProject: (listener) => {
                const disposable = projectManager.onDidChangeProject(listener);
                return disposable.dispose.bind(disposable);
            },
        };
    } catch (error) {
        ExtensionOutputChannel.error(
            'Extension',
            'ACTIVATION FAILED',
            error instanceof Error ? error : new Error(String(error)),
        );
        vscode.window.showErrorMessage(`Kaskad Core failed to activate: ${error}`);
        throw error;
    }
}

export function deactivate() {
    ExtensionOutputChannel.info('Extension', 'Extension deactivated');
}
