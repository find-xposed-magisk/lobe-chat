import { CodeInterpreterApiName } from '../../types';
import { ExecuteCodeStreaming } from './ExecuteCode';

/**
 * Code Interpreter Streaming Components Registry
 */
export const CodeInterpreterStreamings = {
  [CodeInterpreterApiName.executeCode]: ExecuteCodeStreaming,
};
