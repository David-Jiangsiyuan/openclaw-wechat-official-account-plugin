/**
 * OAPlugin v3.0.0 - 消息分片工具
 *
 * 微信公众号客服消息限制 2048 字节
 * 按自然边界智能分片，不截断多字节字符
 */

/**
 * 获取字符串 UTF-8 字节长度
 */
export function getUtf8ByteLength(str: string): number {
  return Buffer.byteLength(str, "utf-8");
}

/**
 * 按字节限制分割文本
 *
 * 分割优先级（从高到低）：
 * 1. 段落 (\n\n)
 * 2. 分割线 (--- 或 ***)
 * 3. 换行 (\n)
 * 4. 句末标点 (。！？.!?)
 * 5. 空格
 * 6. 字符（不截断多字节字符）
 */
export function splitTextByByteLimit(
  text: string,
  limit: number = 2048
): string[] {
  if (getUtf8ByteLength(text) <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (getUtf8ByteLength(remaining) > limit) {
    // 尝试在 limit 范围内找到最佳分割点
    let splitPoint = findBestSplitPoint(remaining, limit);

    if (splitPoint <= 0) {
      // 如果找不到合适的分割点，按字符逐个字节截断
      splitPoint = findCharSplitPoint(remaining, limit);
    }

    const chunk = remaining.substring(0, splitPoint).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    remaining = remaining.substring(splitPoint).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * 寻找最佳分割点
 */
function findBestSplitPoint(text: string, limit: number): number {
  // 在 limit 字节范围内搜索
  let searchEnd = text.length;
  let byteCount = 0;

  for (let i = 0; i < text.length; i++) {
    byteCount += getUtf8ByteLength(text[i]);
    if (byteCount > limit) {
      searchEnd = i;
      break;
    }
  }

  const searchText = text.substring(0, searchEnd);

  // 优先级 1: 段落分隔 (\n\n)
  let pos = searchText.lastIndexOf("\n\n");
  if (pos > 0) return pos;

  // 优先级 2: 分割线
  pos = Math.max(
    searchText.lastIndexOf("\n---\n"),
    searchText.lastIndexOf("\n***\n")
  );
  if (pos > 0) return pos + 1;

  // 优先级 3: 换行
  pos = searchText.lastIndexOf("\n");
  if (pos > 0) return pos;

  // 优先级 4: 句末标点
  const punctuationRegex = /[。！？\.\!\?][^。！？\.\!\?]*$/;
  const match = searchText.match(punctuationRegex);
  if (match && match.index !== undefined && match.index > 0) {
    return match.index + 1;
  }

  // 优先级 5: 空格
  pos = searchText.lastIndexOf(" ");
  if (pos > 0) return pos;

  // 找不到合适的分割点
  return -1;
}

/**
 * 按字符逐个字节截断（最后手段）
 * 确保不截断多字节字符
 */
function findCharSplitPoint(text: string, limit: number): number {
  let byteCount = 0;

  for (let i = 0; i < text.length; i++) {
    const charBytes = getUtf8ByteLength(text[i]);

    // 如果加上这个字符就超了，在这里截断
    if (byteCount + charBytes > limit) {
      return i;
    }

    byteCount += charBytes;
  }

  return text.length;
}

/**
 * 安全截断文本（确保不截断多字节字符）
 */
export function safeTruncate(text: string, maxBytes: number): string {
  if (getUtf8ByteLength(text) <= maxBytes) {
    return text;
  }

  let byteCount = 0;
  let endIndex = 0;

  for (let i = 0; i < text.length; i++) {
    const charBytes = getUtf8ByteLength(text[i]);
    if (byteCount + charBytes > maxBytes) {
      break;
    }
    byteCount += charBytes;
    endIndex = i + 1;
  }

  return text.substring(0, endIndex);
}

/**
 * 检查文本是否需要分片
 */
export function needsSplit(text: string, limit: number = 2048): boolean {
  return getUtf8ByteLength(text) > limit;
}

/**
 * 分片统计信息
 */
export function getSplitStats(
  text: string,
  limit: number = 2048
): { totalChunks: number; totalBytes: number; maxChunkBytes: number } {
  const chunks = splitTextByByteLimit(text, limit);
  const chunkBytes = chunks.map((c) => getUtf8ByteLength(c));

  return {
    totalChunks: chunks.length,
    totalBytes: getUtf8ByteLength(text),
    maxChunkBytes: Math.max(...chunkBytes),
  };
}
