/**
 * 아이콘 오프라인 등록 — main.tsx 에서 App 보다 먼저 import.
 *
 * 이걸 해 두면 @iconify/react 가 api.iconify.design 에 요청하지 않는다.
 * (사내망·오프라인에서도 아이콘이 그대로 보인다.)
 * 새 아이콘을 쓰면 `npm run icons` 로 번들을 다시 굽는다.
 */
import { addCollection } from "@iconify/react";
import icons from "./icons.generated";

addCollection(icons);
