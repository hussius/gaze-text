// Minimal typings for the parts of WebGazer 3.x this project uses.
// Only types are imported from here; at runtime WebGazer is a global (see webgazerSource.ts).
declare module 'webgazer' {
  export interface GazePrediction {
    x: number;
    y: number;
  }

  export interface WebGazer {
    params: { faceMeshSolutionPath: string; [key: string]: unknown };
    begin(onFail?: () => void): Promise<WebGazer>;
    end(): WebGazer;
    stopVideo(): WebGazer;
    pause(): WebGazer;
    resume(): Promise<WebGazer>;
    isReady(): boolean;
    setRegression(name: 'ridge' | 'weightedRidge' | 'threadedRidge'): WebGazer;
    setGazeListener(listener: (data: GazePrediction | null, elapsedMs: number) => void): WebGazer;
    clearGazeListener(): WebGazer;
    recordScreenPosition(x: number, y: number, eventType?: 'click' | 'move'): WebGazer;
    clearData(): Promise<void>;
    saveDataAcrossSessions(save: boolean): WebGazer;
    applyKalmanFilter(apply: boolean): WebGazer;
    showVideoPreview(show: boolean): WebGazer;
    showVideo(show: boolean): WebGazer;
    showFaceOverlay(show: boolean): WebGazer;
    showFaceFeedbackBox(show: boolean): WebGazer;
    showPredictionPoints(show: boolean): WebGazer;
    setVideoViewerSize(width: number, height: number): WebGazer;
    removeMouseEventListeners(): WebGazer;
    getCurrentPrediction(): Promise<GazePrediction | null>;
    getRegression(): Record<string, unknown>[];
    util: { DataWindow: new (size: number) => unknown };
  }

  const webgazer: WebGazer;
  export default webgazer;
}
