/**
 * MIT License
 *
 * Copyright (c) 2025 Martin Crawford
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import * as vscode from "vscode";
import path from "path";
import fs from "fs";
import { PreviewController } from "./PreviewController";
import { PreviewStoryManager } from "./PreviewStoryManager";
import { FunctionStoryEvent } from "./PreviewState";
import { Compiler } from "inkjs/compiler/Compiler";
import { Story } from "inkjs";

export class PreviewManager {
  // Private Static Properties ========================================================================================

  private static instance: PreviewManager | undefined;

  // Private Properties ===============================================================================================

  private readonly webviewPanel: vscode.WebviewPanel;
  private readonly controller: PreviewController;
  private uri: vscode.Uri | undefined;
  private version: number = 0;
  private storyManager?: PreviewStoryManager;
  private readonly extensionUri: vscode.Uri;
  private liveUpdateEnabled: boolean = true; // Live update enabled by default

  // Public Static Methods ============================================================================================

  public static getInstance(extensionUri: vscode.Uri): PreviewManager {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : undefined;

    // If we already have a panel, show it
    if (PreviewManager.instance) {
      PreviewManager.instance.webviewPanel.reveal(column);
      return PreviewManager.instance;
    }

    // Otherwise, create a new panel
    PreviewManager.instance = new PreviewManager(extensionUri);
    return PreviewManager.instance;
  }

  // Constructor ======================================================================================================

  private constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;

    const mediaPath = vscode.Uri.joinPath(this.extensionUri, 'media');

    this.webviewPanel = vscode.window.createWebviewPanel(
      "inkPreview",
      "Ink Preview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true,
        localResourceRoots: [mediaPath],
      }
    );

    this.controller = new PreviewController(this.webviewPanel, this.extensionUri);

    // Set up message handlers
    this.controller.setOnToggleLiveUpdate((enabled) => {
      this.setLiveUpdateEnabled(enabled);
    });

    this.webviewPanel.onDidDispose(() => this.dispose());
  }

  // Public Methods ===================================================================================================

  /**
   * Main preview method - now handles compilation and setup
   */
  public async preview(document: vscode.TextDocument): Promise<void> {
    if (
      this.uri &&
      this.uri === document.uri &&
      this.version === document.version
    ) {
      return;
    }

    this.uri = document.uri;
    this.version = document.version;

    // Update the preview panel title
    this.setTitle(document.uri.fsPath);

    // Set document URI for jump to line functionality
    this.controller.setDocumentUri(document.uri);

    // Compile the story
    const story = await this.compileStory(document);
    if (!story) {
      // Errors are already shown in compileStory()
      return;
    }

    // Set up story management
    await this.initializeStoryPreview(story);
  }

  public dispose(): void {
    console.debug("[PreviewManager] 🗑️ Disposing manager");

    this.controller.dispose();
    this.webviewPanel.dispose();
    PreviewManager.instance = undefined;
  }

  /**
   * Check if the preview panel is active
   */
  public isActive(): boolean {
    return PreviewManager.instance !== undefined;
  }

  /**
   * Check if live update is enabled
   */
  public isLiveUpdateEnabled(): boolean {
    return this.liveUpdateEnabled;
  }

  /**
   * Set live update enabled state
   */
  public setLiveUpdateEnabled(enabled: boolean): void {
    this.liveUpdateEnabled = enabled;
    console.log('[PreviewManager] Live update', enabled ? 'enabled' : 'disabled');
  }

  // Private Methods ==================================================================================================

  /**
   * Compile story using inkjs Compiler
   */
  private async compileStory(document: vscode.TextDocument): Promise<Story | null> {
    const storyContent = document.getText();
    const documentPath = document.uri.fsPath;
    const documentDir = path.dirname(documentPath);
    
    console.log('[PreviewManager] Compiling story, content length:', storyContent.length);
    console.log('[PreviewManager] Document path:', documentPath);
    console.log('[PreviewManager] Document directory:', documentDir);
    
    // Create a FileHandler for resolving INCLUDE directives
    const fileHandler = {
      ResolveInkFilename: (includeName: string) => {
        // Remove .ink extension if present
        const cleanName = includeName.replace(/\.ink$/i, '');
        const inkPath = path.resolve(documentDir, cleanName + '.ink');
        console.log('[PreviewManager] Resolving include:', includeName, '->', inkPath);
        return inkPath;
      },
      LoadInkFileContents: (fullPath: string) => {
        try {
          console.log('[PreviewManager] Loading file:', fullPath);
          const content = fs.readFileSync(fullPath, 'utf-8');
          console.log('[PreviewManager] File loaded, length:', content.length);
          return content;
        } catch (error: any) {
          console.error('[PreviewManager] Failed to load file:', fullPath, error);
          throw new Error(`Failed to load included file: ${fullPath}\n${error.message}`);
        }
      }
    };
    
    const compiler = new Compiler(storyContent, {
      fileHandler: fileHandler
    } as any);
    
    try {
      const story = compiler.Compile();
      
      // Check for compilation errors using the errors property
      const errors = compiler.errors;
      const warnings = compiler.warnings;
      
      console.log('[PreviewManager] Compilation completed.');
      console.log('[PreviewManager] Errors:', errors ? errors.length : 0);
      console.log('[PreviewManager] Warnings:', warnings ? warnings.length : 0);
      
      if (errors && errors.length > 0) {
        console.error('[PreviewManager] Compilation errors:', errors);
        // Show detailed error information with line numbers
        this.controller.showErrors(
          errors.map(err => ({
            message: err,
            severity: 'error' as const
          }))
        );
        return null;
      }
      
      console.log('[PreviewManager] Compilation successful!');
      return story;
    } catch (error: any) {
      console.error('[PreviewManager] Compilation failed with exception:', error);
      
      // Try to get errors from compiler first
      const errors = compiler.errors;
      if (errors && errors.length > 0) {
        this.controller.showErrors(
          errors.map(err => ({
            message: err,
            severity: 'error' as const
          }))
        );
      } else {
        // Fallback to exception message
        this.controller.showErrors([{
          message: error.message || 'Unknown compilation error',
          severity: 'error'
        }]);
      }
      
      return null;
    }
  }

  /**
   * Initializes the Preview Manager with a Preview Story Manager with a new Ink Story.
   */
  private async initializeStoryPreview(story: Story): Promise<void> {
    this.storyManager = new PreviewStoryManager(story);
    await this.controller.initializeStory(this.storyManager);
  }

  /**
   * Sets the title of the webview panel.
   */
  private setTitle(fileName: string): void {
    this.webviewPanel.title = `${path.basename(fileName)} (Preview)`;
  }
}
