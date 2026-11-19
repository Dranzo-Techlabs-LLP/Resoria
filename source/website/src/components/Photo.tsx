// A cover-fit photo. Real images are pre-sized under /public/images, so the
// plain <img> is used on purpose (next/image optimisation is off in next.config).
import FlowingWater from "./water/FlowingWater";

export default function Photo({
  src,
  alt,
  priority = false,
  position,
  flow,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  /** Which part of the photo to keep when it's cropped (CSS object-position) */
  position?: string;
  /** Flow map for a waterfall in the photo: sets it flowing (FlowingWater.tsx) */
  flow?: string;
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : undefined}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: position }}
      />
      {flow && <FlowingWater flow={flow} />}
    </>
  );
}
