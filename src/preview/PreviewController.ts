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
import { PreviewHtmlGenerator } from "./PreviewHtmlGenerator";
import { PreviewStateManager } from "./PreviewStateManager";
import { PreviewStoryManager } from "./PreviewStoryManager";
import { ErrorInfo, FunctionStoryEvent, PreviewState } from "./PreviewState";
import { inboundMessages, Message } from "./PreviewMessages";
import { Deferred } from "../util/deferred";
import { AddErrorsAction } from "./actions/AddErrorsAction";
import { AddStoryEventsAction } from "./actions/AddStoryEventsAction";
import { StartStoryAction } from "./actions/StartStoryAction";
import { PreviewAction } from "./PreviewAction";
import { SelectChoiceAction } from "./actions/SelectChoiceAction";
import { RewindStoryAction } from "./actions/RewindStoryAction";
import { ToggleLiveUpdateUIAction } from "./actions/ToggleLiveUpdateUIAction";

/**
 * Controller for the Preview Webview that coordinates Preview State with the Webview.
 */
export class PreviewController {
  // Private Properties ===============================================================================================

  private readonly webviewPanel: vscode.WebviewPanel;
  private readonly htmlGenerator: PreviewHtmlGenerator;
  private readonly disposables: vscode.Disposable[] = [];
  private stateManager: PreviewStateManager;
  private isInitialized: boolean = false;
  private viewReadyDeferred: Deferred<void> | null = null;
  private onToggleLiveUpdate?: (enabled: boolean) => void;
  private documentUri?: vscode.Uri;

  // Constructor ======================================================================================================

  constructor(
    webviewPanel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    stateManager = new PreviewStateManager()
  ) {
    this.webviewPanel = webviewPanel;
    this.htmlGenerator = new PreviewHtmlGenerator(extensionUri);
    this.stateManager = stateManager;
    this.setupWebview();
    this.setupMessageHandlers();
    this.setupStateChangeHandler();
  }

  // Public Methods ===================================================================================================

  /**
   * Initializes the Preview Controller with a Preview Story Manager with a new Ink Story.
   */
  public async initializeStory(
    storyManager: PreviewStoryManager
  ): Promise<void> {
    this.stateManager.setStoryManager(storyManager);
    this.stateManager.reset();

    if (!this.isInitialized) {
      this.isInitialized = true;
      this.viewReadyDeferred = new Deferred<void>();
      await this.viewReadyDeferred.promise;
    }

    // Start the story
    this.stateManager.dispatch(new StartStoryAction());
  }

  /**
   * Refreshes the Preview Controller with a Preview Story Manager with an updated Ink Story.
   */
  public async refreshStory(storyManager: PreviewStoryManager): Promise<void> {
    this.stateManager.setStoryManager(storyManager);
    this.stateManager.replay();
  }

  /**
   * Triggers the Preview Controller to show a compilation error in the Preview Webview.
   */
  public async showCompilationError(): Promise<void> {
    this.stateManager.reset();
    this.showErrors([
      {
        message:
          "Story had errors and could not be compiled. Review the Problem Panel for more information.",
        severity: "error",
      },
    ]);
  }

  /**
   * Triggers the Preview Controller to show errors in the Preview Webview.
   */
  public showErrors(errors: ErrorInfo[]): void {
    this.stateManager.dispatch(new AddErrorsAction(errors));
  }

  /**
   * Triggers the Preview Controller to add a function event to the Preview State.
   */
  public addFunctionEvent(functionEvent: FunctionStoryEvent): void {
    this.stateManager.dispatch(new AddStoryEventsAction([functionEvent]));
  }

  /**
   * Gets the current preview state.
   * @returns The current preview state
   */
  public getState(): PreviewState {
    return this.stateManager.getState();
  }

  /**
   * Set the callback for live update toggle
   */
  public setOnToggleLiveUpdate(callback: (enabled: boolean) => void): void {
    this.onToggleLiveUpdate = callback;
  }

  /**
   * Set the document URI for jump to line functionality
   */
  public setDocumentUri(uri: vscode.Uri): void {
    this.documentUri = uri;
  }

  /**
   * Disposes of the controller and cleans up all resources.
   */
  public dispose(): void {
    console.debug("[PreviewController] 🗑️ Disposing controller");

    if (this.stateManager) {
      this.stateManager.dispose();
    }

    this.disposables.forEach((disposable) => disposable.dispose());
    this.disposables.length = 0;
  }

  // Private Methods ==================================================================================================

  /**
   * Creates an action instance from the given data.
   * @param data - The action data
   * @returns The action instance
   */
  private createAction(data: any): PreviewAction {
    if (data.type === StartStoryAction.actionType) {
      return new StartStoryAction();
    }
    if (data.type === SelectChoiceAction.actionType) {
      return new SelectChoiceAction(data.payload.choiceIndex);
    }
    if (data.type === RewindStoryAction.actionType) {
      return new RewindStoryAction();
    }
    if (data.type === ToggleLiveUpdateUIAction.actionType) {
      return new ToggleLiveUpdateUIAction(data.payload.enabled);
    }
    throw new Error(`Unknown action type: ${data.type}`);
  }

  /**
   * Executes a UI action by creating the action instance and applying it.
   * @param action - The action to execute
   */
  private executeAction(data: any): void {
    const actionInstance = this.createAction(data);
    this.stateManager.dispatch(actionInstance);
  }

  /**
   * Registers a message handler for a specific command.
   */
  private registerMessageHandler(
    command: string,
    callback: (payload: any) => void
  ): void {
    const handler = (message: Message) => {
      if (message.command !== command) {
        return;
      }
      const logMessage = `[PreviewController] 📥 Received message: ${command}:`;
      console.debug(logMessage, message.payload);
      callback(message.payload);
    };

    this.disposables.push(
      this.webviewPanel.webview.onDidReceiveMessage(handler)
    );
  }

  /**
   * Sets up message handlers for webview communication.
   */
  private setupMessageHandlers(): void {
    // Handle webview ready
    this.registerMessageHandler(inboundMessages.ready, () => {
      console.debug("[PreviewController] 📖 Webview ready");
      if (this.viewReadyDeferred) {
        this.viewReadyDeferred.resolve();
        this.viewReadyDeferred = null;
      }
    });

    // Handle all actions
    this.registerMessageHandler(inboundMessages.action, (actionData: any) => {
      this.executeAction(actionData);
    });

    // Handle live update toggle
    this.registerMessageHandler(inboundMessages.toggleLiveUpdate, (payload: { enabled: boolean }) => {
      console.log('[PreviewController] Live update toggled:', payload.enabled);
      if (this.onToggleLiveUpdate) {
        this.onToggleLiveUpdate(payload.enabled);
      }
    });

    // Handle jump to line
    this.registerMessageHandler(inboundMessages.jumpToLine, async (payload: { line?: number; text?: string }) => {
      console.log('[PreviewController] Jump to line/text:', payload);
      if (this.documentUri) {
        const document = await vscode.workspace.openTextDocument(this.documentUri);
        
        let position: vscode.Position;
        
        if (payload.line !== undefined) {
          // Jump to specific line number
          position = new vscode.Position(payload.line, 0);
        } else if (payload.text) {
          // Search for text in document
          const text = document.getText();
          const searchText = payload.text.trim();
          const index = text.indexOf(searchText);
          
          if (index !== -1) {
            position = document.positionAt(index);
            // Move cursor to the start of the line
            position = new vscode.Position(position.line, 0);
          } else {
            // Text not found, stay at current position
            console.warn('[PreviewController] Text not found in document:', searchText);
            return;
          }
        } else {
          return;
        }
        
        // First, open editor with focus to show cursor
        const editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
          preserveFocus: false, // Get focus to show cursor
          preview: false
        });
        
        // Set cursor at the start of the line
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        
        // After a short delay, return focus to webview
        setTimeout(() => {
          this.webviewPanel.reveal(vscode.ViewColumn.Beside, false);
        }, 100);
      }
    });
  }

  /**
   * Set up the state change handler.
   */
  private setupStateChangeHandler(): void {
    this.stateManager.setOnStateChange((state) => {
      const message: Message = {
        command: "updateState",
        payload: {
          state,
        },
      };
      this.webviewPanel.webview.postMessage(message);
    });
  }

  /**
   * Sets up the webview and initializes its content.
   */
  private setupWebview(): void {
    console.debug("[PreviewController] 👀 Initializing preview webview");
    this.webviewPanel.webview.html = this.htmlGenerator.generateHtml(
      this.webviewPanel.webview
    );
  }
}
