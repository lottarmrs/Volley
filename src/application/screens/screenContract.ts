export type ScreenContract<Model, Intent> = {
  model: Model;
  dispatch(intent: Intent): Promise<void>;
};
