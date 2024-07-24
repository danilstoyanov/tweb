import {Portal} from 'solid-js/web';
import {createStore, unwrap} from 'solid-js/store';
import {ChatType} from '../chat/chat';
import {createEffect, createSignal, JSX, For, on, onMount, Show, splitProps, onCleanup} from 'solid-js';
import classNames from '../../helpers/string/classNames';
import {RangeSelectorTsx} from '../rangeSelectorTsx';
import RowTsx from '../rowTsx';
import type {RangeSelectorProps} from '../rangeSelectorTsx';
import {ButtonIconTsx} from '../buttonIconTsx';
import ColorPickerTsx from '../colorPickerTsx';
import rootScope from '../../lib/rootScope';
import styles from './mediaEditor.module.scss';
import {hexaToRgba, hexToRgb, hexToRgbaWithOpacity} from '../../helpers/color';
import {ButtonCornerTsx} from '../buttonCornerTsx';
import {PenSvg, ArrowSvg, BrushSvg, NeonBrushSvg, BlurSvg, EraserSvg} from './tools-svg';
import main_canvas_png from './main-canvas.png';
// import png from './with_footer.png';
import img_crop_debugger from './CROP_DEBUGGER.png';
import img_200x200_1_1 from './200x200_1_1.png';
import img_320x200_8_5 from './320x200_8_5.png';
import img_3840x2160_8_4 from './3840x2160_8_4.png';
import img_3840x3840_1_1 from './3840x3840_1_1.png';
import {rotateImage} from './canvas';

// import png from './sonic.jpg';
// import png from './small.png';
import debounce from '../../helpers/schedulers/debounce';
import {useAppState} from '../../stores/appState';
import {
  applyBrightness,
  applyContrast,
  applyVignette,
  applyEnhance,
  applySaturation,
  applyWarmth,
  applyFade,
  applyHighlights,
  applySelectiveShadow,
  applyGrain,
  applySharp
} from './filters';
import {isStickerEntity, isTextEntity, StickerEntity, StickerEntityType, TextEntity, TextEntityType, TransformableEntity} from './entities'
import ColorPicker from '../colorPicker';
import {DrawingManager, PenTool, ArrowTool, BrushTool, NeonTool, EraserTool} from './drawing';
import StickersTab from './sticker-tab';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import readBlobAsDataURL from '../../helpers/blob/readBlobAsDataURL';
import throttle from '../../helpers/schedulers/throttle';
import EmoticonsDropdown from './emoticons-dropdown';
import resizeableImage from '../../lib/cropper';
import ResizeableImage from './resizeableImage';
import {Crop} from './crop';
import type {CropAspectRatio} from './crop';

/* Navbar & Tabs */
type FilterType = 'enhance'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'warmth'
  | 'fade'
  | 'highlights'
  | 'shadows'
  | 'vignette'
  | 'grain'
  | 'sharpen';

type MediaEditorTab = 'enhance'
  | 'crop'
  | 'text'
  | 'brush'
  | 'smile';

type ToolType = 'pen'
  | 'arrow'
  | 'brush'
  | 'neon'
  | 'blur'
  | 'eraser'
  | '';

interface MediaEditorColorPickerProps {
  onChange: (color: Pick<ReturnType<ColorPicker['getCurrentColor']>, 'rgba'>) => void;
}

interface MediaEditorToolProps {
  svg: JSX.Element;
  color: string;
  title: string;
  isSelected: boolean;
  onClick: () => void;
}

interface MediaEditorTool {
  id: number;
  size: number;
  type: ToolType;
  color?: string;
  instance?: any;
}

export interface MediaEditorCropState {
  x: number;
  y: number;
  width: number;
  height: number;
  workareaHeight: number;
  workareaWidth: number;
  tilt: number; // tilt is angle we can choose on ruler
  rotate: number; // rotate is angle we can apply with button
  isFlipped: false;
  isApplied: false;
  aspectRatio: CropAspectRatio;
}

const createRandomColorImage = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;

  const ctx = canvas.getContext('2d');

  // Generate a random color
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);

  // Set the fill color and fill the canvas
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, 128, 128);

  // Create a new image
  const img = new Image(128, 128);
  img.src = canvas.toDataURL();

  return img;
}

const MediaEditorRangeSelector = (props: RangeSelectorProps & { label: string }) => {
  const [local, others] = splitProps(props, ['label']);
  const [currentValue, setCurrentValue] = createSignal(props.value);

  const handleValueChange = (value: number) => {
    setCurrentValue(value);

    if(others.onScrub) {
      others.onScrub(value);
    }
  };

  return (
    <div class={styles.MediaEditorRangeSelector}>
      <div class={styles.MediaEditorRangeSelectorLegend}>
        <div class={styles.MediaEditorRangeSelectorLegendLabel}>
          {local.label}
        </div>
        <div class={classNames(styles.MediaEditorRangeSelectorLegendValue, currentValue() === props.value && styles.MediaEditorRangeSelectorLegendValueDefault)}>
          {currentValue()}
        </div>
      </div>

      <div class={styles.MediaEditorRangeSelectorTrack}>
        <RangeSelectorTsx {...others} onScrub={handleValueChange} />
      </div>
    </div>
  );
};

const MediaEditorColorPicker = (props: MediaEditorColorPickerProps) => {
  const COLORS = [
    '#FFFFFF',
    '#FE4438',
    '#FF8901',
    '#FFD60A',
    '#33C759',
    '#62E5E0',
    '#0A84FF',
    '#BD5CF3'
  ] as const;

  type ColorPickerColor = typeof COLORS[number];

  const RIPPLIFIED_COLORS = COLORS.map(color => `rgba(${hexToRgbaWithOpacity(color, 0.2).join(', ')})`);

  const [currentColor, setCurrentColor] = createSignal<string>(COLORS[0]);

  const [customColorTabActive, setCustomColorTabActive] = createSignal(false);

  const handleColorTabClick = (hexColor: ColorPickerColor) => {
    setCurrentColor(hexColor);
    setCustomColorTabActive(false);

    props.onChange({
      rgba: `rgba(${hexaToRgba(hexColor).join(',')})`
    })
  }

  const handleCustomColorToggleClick = () => {
    setCurrentColor();
    setCustomColorTabActive(true);
  }

  return (
    <div class={styles.MediaEditorColorPicker}>
      <div class={styles.MediaEditorColorPickerTabs}>
        <For each={COLORS}>
          {(color, index) => (
            <ButtonIconTsx
              style={{
                '--color-picker-tabs-circle-color': COLORS[index()],
                '--color-picker-tabs-circle-ripple-color': RIPPLIFIED_COLORS[index()]
              }}
              onClick={() => handleColorTabClick(color)}
              class={classNames(styles.MediaEditorColorPickerTabsButton,  currentColor() === color ? styles.Active : '')}
              noRipple
            >
              <div class={styles.MediaEditorColorPickerTabsCircle} />
            </ButtonIconTsx>
          )}
        </For>

        <ButtonIconTsx
          style={{
            '--color-picker-tabs-circle-color': COLORS[0],
            '--color-picker-tabs-circle-ripple-color': RIPPLIFIED_COLORS[0]
          }}
          onClick={handleCustomColorToggleClick}
        >

          <div
            style={{
              '--color-picker-tabs-custom-circle-color': currentColor() ?? 'transparent'
            }}
            classList={{
              [styles.MediaEditorColorPickerTabsCircle]: true,
              [styles.MediaEditorColorPickerTabsCircleCustomColor]: true
            }}
          />
        </ButtonIconTsx>
      </div>

      <Show when={!!customColorTabActive()}>
        <ColorPickerTsx
          class={styles.MediaEditorColorPickerWidget}
          onChange={props.onChange}
        />
      </Show>
    </div>
  )
};

const MediaEditorTool = (props: MediaEditorToolProps) => {
  const ret = (
    <div class={styles.ToolRow}>
      <div class={styles.ToolSvgWrapper}>
        <div class={styles.ToolSvg} style={{color:props.color}}>
          {props.svg}
        </div>
      </div>

      <div class={styles.ToolTitle}>
        {props.title}
      </div>
    </div>
  );

  return (
    <RowTsx
      title={ret}
      clickable={props.onClick}
      rowClasses={[
        'row-small',
        styles.Tool,
        props.isSelected ? styles.ToolSelected : ''
      ]}
    />
  );
};

type MediaEditorStateType = {
  selectedToolId: number;
  selectedEntityId: number;
  tools: MediaEditorTool[];
  entities: Array<TextEntityType | StickerEntityType>;
  crop: MediaEditorCropState;
  workarea: {
    contentPreviewOriginalHeight: number;
    contentPreviewOriginalWidth: number;
  }
};

type MediaEditorFilter = {
  id: FilterType;
  value: number;
}

type MediaEditorFilterState = {
  cache: Record<string, ImageBitmap>;
  appliedFilters: MediaEditorFilter[];
  isProcessing: boolean;
};

type MediaEditorWorkareaDimensions = {
  width: number;
  height: number;
};

export const MediaEditor = () => {
  let previewRef: HTMLDivElement;
  let previewContentRef: HTMLDivElement;
  let stickerTabRef: HTMLDivElement;
  let filterLayerCanvas: HTMLCanvasElement;
  let drawingLayerCanvas: HTMLCanvasElement;
  let DrawingManagerInstance: DrawingManager;

  const initialState: MediaEditorStateType = {
    selectedEntityId : -1,
    selectedToolId: 0,
    tools: [
      {
        id: 0,
        type: 'pen',
        size: 16,
        color: '#FE4438',
        instance: new PenTool()
      },
      {
        id: 1,
        type: 'arrow',
        size: 16,
        color: '#FFD60A',
        instance: new ArrowTool()
      },
      {
        id: 2,
        type: 'brush',
        size: 16,
        color: '#FF8901',
        instance: new BrushTool()
      },
      {
        id: 3,
        type: 'neon',
        size: 16,
        color: '#62E5E0',
        instance: new NeonTool()
      },
      {
        id: 4,
        type: 'blur',
        size: 16,
        color: '#fff'
        // instance: new PrimitivePen(),
      },
      {
        id: 5,
        type: 'eraser',
        size: 16,
        color: '#fff',
        instance: new EraserTool()
      }
    ],
    entities: [
      // {
      //   id: 0,
      //   x: 100,
      //   y: 100,
      //   width: 300,
      //   height: 100,
      //   type: 'text',
      //   textAlign: 'left',
      //   appearance: 'plain',
      //   backgroundColor: '',
      //   fontSize: 32,
      //   fontFamily: 'Roboto',
      //   color: '#fff',
      //   rotate: 0
      // },
      // {
      //   id: 1,
      //   x: 200,
      //   y: 150,
      //   width: 200,
      //   height: 100,
      //   type: 'text',
      //   textAlign: 'left',
      //   appearance: 'plain',
      //   backgroundColor: '',
      //   fontSize: 32,
      //   fontFamily: 'Roboto',
      //   color: '#fff',
      //   rotate: 0
      // },
      // {
      //   id: 2,
      //   x: 300,
      //   y: 300,
      //   width: 200,
      //   height: 200,
      //   type: 'sticker',
      //   color: '#fff',
      //   rotate: 0,
      //   node: randomColorImage
      // }
    ],
    crop: {
      x: 0,
      y: 0,
      height: 0,
      width: 0,
      workareaHeight: 0,
      workareaWidth: 0,
      rotate: 0,
      tilt: 0,
      isFlipped: false,
      isApplied: false,
      aspectRatio: 'Free'
    },
    workarea: {
      contentPreviewOriginalHeight: 0,
      contentPreviewOriginalWidth: 0
    }
    // workarea: {}
  }

  const initialFilterState: MediaEditorFilterState = {
    cache: {},
    appliedFilters: [],
    isProcessing: false
  };

  const [originalImage, setOriginalImage] = createSignal<HTMLImageElement>();
  const [workareaDimensions, setWorkareaDimensions] = createSignal<MediaEditorWorkareaDimensions>();

  const [activeTab, setActiveTab] = createSignal<MediaEditorTab>('enhance');
  const [cropPreview, setCropPreview] = createSignal<HTMLImageElement>();

  const [state, setState] = createStore<MediaEditorStateType>(initialState);
  const [filterState, setFilterState] = createStore<MediaEditorFilterState>(initialFilterState);

  const handleTabClick = (tab: MediaEditorTab) => {
    setActiveTab(tab);
  };

  function getScaledImageSize(ref: HTMLDivElement, {imageWidth, imageHeight}: {imageWidth: number, imageHeight: number}) {
    const workareaPadding = (window.innerWidth * 0.2);
    const previewWidth = ref.clientWidth - workareaPadding;
    const previewHeight = ref.clientHeight;

    const originalWidth = imageWidth;
    const originalHeight = imageHeight;

    // Calculate the scaling ratio to fit the width
    const widthRatio = previewWidth / originalWidth;
    const newWidth = previewWidth;
    const newHeight = originalHeight * widthRatio;

    // Check if the new height fits within the preview area
    if(newHeight > previewHeight) {
      // If the height exceeds the preview height, scale down to fit the height
      const heightRatio = previewHeight / originalHeight;
      const newWidth = originalWidth * heightRatio;
      const newHeight = previewHeight;

      return {
        width: newWidth,
        height: newHeight
      };
    }

    return {
      width: newWidth,
      height: newHeight
    };
  };

  function scaleCropToOriginalImage(crop: MediaEditorCropState, {imageWidth, imageHeight}: {imageWidth: number, imageHeight: number}) {
    const {
      x,
      y,
      width,
      height,
      rotate,
      workareaHeight,
      workareaWidth
    } = crop;

    let originalImageWidth = imageWidth;
    let originalImageHeight = imageHeight;

    // Swap the width and height if the rotation angle is 90 or 270 degrees
    if(rotate % 180 !== 0) {
      [originalImageWidth, originalImageHeight] = [originalImageHeight, originalImageWidth];
    }

    // Calculate the scale factors for width and height
    const scaleX = originalImageWidth / workareaWidth;
    const scaleY = originalImageHeight / workareaHeight;

    // Proportionally calculate x, y, width, and height for the original image
    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    const scaledWidth = width * scaleX;
    const scaledHeight = height * scaleY;

    return {
      x: scaledX,
      y: scaledY,
      width: scaledWidth,
      height: scaledHeight
    };
  };

  // * Crop Application
  const applyCrop = async() => {
    const {x, y, width, height} = scaleCropToOriginalImage(state.crop, {
      imageHeight: originalImage().height,
      imageWidth: originalImage().width
    });

    const dimensions = getScaledImageSize(previewRef, {
      imageHeight: height,
      imageWidth: width
    });

    setWorkareaDimensions(dimensions);

    // Update canvas dimensions
    filterLayerCanvas.width = dimensions.width;
    filterLayerCanvas.height = dimensions.height;
    drawingLayerCanvas.width = dimensions.width;
    drawingLayerCanvas.height = dimensions.height;
    previewContentRef.style.width = `${dimensions.width}px`;
    previewContentRef.style.height = `${dimensions.height}px`;

    const filterLayerCtx = filterLayerCanvas.getContext('2d');

    filterLayerCtx.fillRect(0, 0, filterLayerCanvas.width, filterLayerCanvas.height);
    filterLayerCtx.fillStyle = 'green';

    const originalImageBitmap = await createImageBitmap(originalImage());

    const rotatedOriginalImageBitmap = await rotateImage(originalImageBitmap, state.crop.rotate);
    filterLayerCtx.drawImage(rotatedOriginalImageBitmap, x, y, width, height, 0, 0, dimensions.width, dimensions.height);
  };


  const onCropChange = async(crop: MediaEditorCropState) => {
    const prevCropAngle = state.crop.rotate || 0;
    const newCropAngle = crop.rotate

    setState('crop', prevState => ({
      ...prevState,
      ...crop
    }));

    console.log('prevCropAngle: ', prevCropAngle, crop.rotate);

    if(newCropAngle && prevCropAngle !== newCropAngle) {
      // Перезапускаем кроппер
      const preview = await renderMediaForCrop(newCropAngle) as string;
      const img = new Image();
      img.src = preview;
      setCropPreview(img);
    }

    // crop: {
    //   x: 0,
    //   y: 0,
    //   height: 0,
    //   width: 0,
    //   rotate: 0,
    //   isFlipped: false,
    //   isApplied: false
    // }
  };

  // * Canvas Renderer
  const renderMedia = (angle: number) => {
    return new Promise((resolve, reject) => {
      // Create a new canvas for the resulting image
      const resultCanvas = document.createElement('canvas');
      resultCanvas.width = filterLayerCanvas.width;
      resultCanvas.height = filterLayerCanvas.height;
      const resultCtx = resultCanvas.getContext('2d');

      // Render the base layer
      resultCtx.drawImage(filterLayerCanvas, 0, 0);

      // Render the drawing layer without transparency
      resultCtx.drawImage(drawingLayerCanvas, 0, 0);

      // Render stickers
      // state.entities.forEach(entity => {
      //   if(isStickerEntity(entity)) {
      //     resultCtx.drawImage(
      //       entity.node, // Assuming `node` is an image element
      //       entity.x,
      //       entity.y,
      //       entity.width === 'auto' ? 100 : entity.width,
      //       entity.height === 'auto' ? 100 : entity.height
      //     );
      //   }
      // });

      // Render text nodes
      // state.entities.forEach(entity => {
      //   if(isTextEntity(entity)) {
      //     resultCtx.font = `${entity.fontSize}px ${entity.fontFamily}`;
      //     resultCtx.fillStyle = entity.color;
      //     resultCtx.textAlign = entity.textAlign;
      //     resultCtx.save();
      //     resultCtx.translate(entity.x + (entity as any).width / 2, entity.y + (entity as any).height / 2);
      //     resultCtx.rotate((entity.rotate * Math.PI) / 180);
      //     resultCtx.fillText(
      //       'Your Text Here', // Replace with the actual text if available in the entity object
      //       -entity.width / 2,
      //       entity.fontSize / 2
      //     );
      //     resultCtx.restore();
      //   }
      // });

      // Convert canvas to blob and resolve with the blob URL
      resultCanvas.toBlob((blob) => {
        if(blob) {
          const data = readBlobAsDataURL(blob);
          resolve(data);
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, 'image/png');
    });
  };

  const renderMediaForCrop = (angle: number) => {
    return new Promise((resolve, reject) => {
      // Calculate the new dimensions of the canvas after rotation
      const radians = angle * (Math.PI / 180);
      const width = filterLayerCanvas.width;
      const height = filterLayerCanvas.height;
      const newWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
      const newHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));

      // Create a new canvas for the resulting image
      const resultCanvas = document.createElement('canvas');
      resultCanvas.width = newWidth;
      resultCanvas.height = newHeight;
      const resultCtx = resultCanvas.getContext('2d');

      // Translate and rotate the context
      resultCtx.translate(newWidth / 2, newHeight / 2);
      resultCtx.rotate(radians);

      // Render the base layer
      resultCtx.drawImage(filterLayerCanvas, -width / 2, -height / 2);

      // Render the drawing layer without transparency
      resultCtx.drawImage(drawingLayerCanvas, -width / 2, -height / 2);

      // Render stickers
      // state.entities.forEach(entity => {
      //   if(isStickerEntity(entity)) {
      //     resultCtx.drawImage(
      //       entity.node, // Assuming `node` is an image element
      //       entity.x - width / 2,
      //       entity.y - height / 2,
      //       entity.width === 'auto' ? 100 : entity.width,
      //       entity.height === 'auto' ? 100 : entity.height
      //     );
      //   }
      // });

      // Render text nodes
      // state.entities.forEach(entity => {
      //   if(isTextEntity(entity)) {
      //     resultCtx.font = `${entity.fontSize}px ${entity.fontFamily}`;
      //     resultCtx.fillStyle = entity.color;
      //     resultCtx.textAlign = entity.textAlign;
      //     resultCtx.save();
      //     resultCtx.translate(entity.x - width / 2 + (entity as any).width / 2, entity.y - height / 2 + (entity as any).height / 2);
      //     resultCtx.rotate((entity.rotate * Math.PI) / 180);
      //     resultCtx.fillText(
      //       'Your Text Here', // Replace with the actual text if available in the entity object
      //       -entity.width / 2,
      //       entity.fontSize / 2
      //     );
      //     resultCtx.restore();
      //   }
      // });

      // Convert canvas to blob and resolve with the blob URL
      resultCanvas.toBlob((blob) => {
        if(blob) {
          const data = readBlobAsDataURL(blob);
          resolve(data);
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, 'image/png');
    });
  };


  // * Tab Handlers
  const handleCropTabToggle = async() => {
    const preview = await renderMediaForCrop(0) as string;

    const img = new Image();
    img.src = preview;

    setCropPreview(img);
    handleTabClick('crop');
  };

  // * FITLER UPDATE WITH RENDER-PIPELINE APPLIED
  const applyFilters = (canvas: HTMLCanvasElement) => {
    const filterMap: Record<FilterType, any> = {
      brightness: applyBrightness,
      contrast: applyContrast,
      saturation: applySaturation,
      enhance: applyEnhance,
      fade: applyFade,
      grain: applyGrain,
      highlights: applyHighlights,
      shadows: applySelectiveShadow,
      sharpen: applySharp,
      warmth: applyWarmth,
      vignette: applyVignette
    }

    filterState.appliedFilters.forEach(filter => {
      filterMap[filter.id](canvas, filter.value);
    })
  };

  const handleFilterUpdate = (type: FilterType) => {
    return throttle(async(value: number) => {
      const ctx = filterLayerCanvas.getContext('2d');

      const dimensions = getScaledImageSize(previewRef, {
        imageHeight: originalImage().naturalHeight,
        imageWidth: originalImage().naturalWidth
      });

      ctx.drawImage(originalImage(), 0, 0, dimensions.width, dimensions.height);

      setFilterState('appliedFilters', (filters) => {
        if(value === 0) {
          return filters.filter(v => v.id !== type);
        }

        if(filters.some(v => v.id === type)) {
          return filters.map(v => v.id === type ? {...v, value} : v);
        }

        return [...filters, {id: type, value}];
      });

      // FILTER PERFORMANCE
      const startTime = performance.now();
      applyFilters(filterLayerCanvas);
      const endTime = performance.now();
      const elapsedTime = endTime - startTime;

      console.log(`Filter pipeline execution time: ${elapsedTime} milliseconds`);
    }, 16);
  };

  const handleBrigthnessUpdate = handleFilterUpdate('brightness');
  const handleEnhanceUpdate = handleFilterUpdate('enhance');
  const handleContrastUpdate = handleFilterUpdate('contrast');
  const handleSaturationUpdate = handleFilterUpdate('saturation');
  const handleWarmthUpdate = handleFilterUpdate('warmth');
  const handleFadeUpdate = handleFilterUpdate('fade');
  const handleHighlightsUpdate = handleFilterUpdate('highlights');
  const handleShadowsUpdate = handleFilterUpdate('shadows');
  const handleVignetteUpdate = handleFilterUpdate('vignette');
  const handleGrainUpdate = handleFilterUpdate('grain');
  const handleSharpUpdate = handleFilterUpdate('sharpen');

  // * Tools Handlers
  const selectTool = (id: number) => {
    setState({selectedToolId: id});
    DrawingManagerInstance.deactivate();
    DrawingManagerInstance.activate(state.tools[id].instance, state.tools[id].color, state.tools[id].size);
  };

  const setToolColor = (color: MediaEditorTool['color']) => {
    setState('tools', state.selectedToolId, {color});
    DrawingManagerInstance.update({color});
  };

  const setToolSize = (size: MediaEditorTool['size']) => {
    setState('tools', state.selectedToolId, {size});
    DrawingManagerInstance.update({size});
  };

  // * Entity Handlers
  const selectEntity = (id: number) => {
    setState({selectedEntityId: id});
  };

  const addStickerEntity = (target: any) => {
    setState('entities', state.entities.length, {
      id: state.entities.length,
      x: 100,
      y: 200,
      width: 200,
      height: 200,
      rotate: 0,
      type: 'sticker',
      node: target.children[0].cloneNode(true)
    });
  };

  // * Text Entity Handlers
  const addTextEntity = () => {
    setState('entities', state.entities.length, {
      id: state.entities.length,
      x: 100,
      y: 200,
      fontSize: 24,
      rotate: 0,
      textAlign: 'left',
      backgroundColor: '',
      color: 'white',
      type: 'text',
      appearance: 'plain',
      height: 'auto',
      width: 'auto'
    });
  };

  const deleteTextEntity = () => {
    setState({
      entities: state.entities.filter(entity => entity.id !== state.selectedEntityId)
    });
  };

  const setTextEntityFont = (fontFamily: TextEntityType['fontFamily']) => {
    setState('entities', state.selectedEntityId, {fontFamily})
  };

  const setTextEntityFontSize = (fontSize: TextEntityType['fontSize']) => {
    setState('entities', state.selectedEntityId, {fontSize})
  };

  const setTextEntityFontColor = (color: TextEntityType['color']) => {
    setState('entities', state.selectedEntityId, {color})
  };

  const setTextEntityTextAlign = (textAlign: TextEntityType['textAlign']) => {
    setState('entities', state.selectedEntityId, {textAlign})
  };

  // * Resize management
  const handleWindowResize = debounce(() => {
    const filterLayerCtx = filterLayerCanvas.getContext('2d');
    const drawingLayerCtx = drawingLayerCanvas.getContext('2d');

    // Save the current state of both layers
    // let filterLayerData = null;
    const drawingLayerData = drawingLayerCtx.getImageData(0, 0, drawingLayerCanvas.width, drawingLayerCanvas.height);

    // if(filterLayerCtx) {
    //   filterLayerData = filterLayerCtx.getImageData(0, 0, filterLayerCanvas.width, filterLayerCanvas.height);
    // }

    const dimensions = getScaledImageSize(previewRef, {
      imageHeight: originalImage().naturalHeight,
      imageWidth: originalImage().naturalWidth
    });

    previewContentRef.style.width = `${dimensions.width}px`;
    previewContentRef.style.height = `${dimensions.height}px`;

    filterLayerCanvas.width = dimensions.width;
    filterLayerCanvas.height = dimensions.height;

    drawingLayerCanvas.width = dimensions.width;
    drawingLayerCanvas.height = dimensions.height;

    setWorkareaDimensions(dimensions);

    // Clear and redraw the filter layer
    if(filterLayerCtx) {
      filterLayerCtx.clearRect(0, 0, filterLayerCanvas.width, filterLayerCanvas.height);
      filterLayerCtx.drawImage(originalImage(), 0, 0, dimensions.width, dimensions.height);
    }

    // Clear and restore the drawing layer
    if(drawingLayerCtx) {
      drawingLayerCtx.clearRect(0, 0, drawingLayerCanvas.width, drawingLayerCanvas.height);
      drawingLayerCtx.putImageData(drawingLayerData, 0, 0);
    }
  }, 16);

  // * On Mount
  onMount(() => {
    // const png = img_crop_debugger;
    const png = img_3840x2160_8_4;

    const image = new Image();

    image.addEventListener('load', () => {
      const dimensions = getScaledImageSize(previewRef, {
        imageHeight: image.naturalHeight,
        imageWidth: image.naturalWidth
      });

      previewContentRef.style.width = `${dimensions.width}px`;
      previewContentRef.style.height = `${dimensions.height}px`;

      filterLayerCanvas.width = dimensions.width;
      filterLayerCanvas.height = dimensions.height;

      drawingLayerCanvas.width = dimensions.width;
      drawingLayerCanvas.height = dimensions.height;

      setWorkareaDimensions(dimensions);

      const ctx = filterLayerCanvas.getContext('2d');
      ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);

      DrawingManagerInstance = new DrawingManager(drawingLayerCanvas, previewContentRef);
      DrawingManagerInstance.activate(state.tools[state.selectedToolId].instance, state.tools[state.selectedToolId].color, state.tools[state.selectedToolId].size);

      // appDownloadManager.construct(rootScope.managers);
      // const stickers = new StickersTab(rootScope.managers);
      // stickers.init();
      // const stickers = EmoticonsDropdown.getElement();
      // EmoticonsDropdown.init((target: any) => {
      //   addStickerEntity(target);
      // });
      // stickerTabRef.appendChild(stickers);

      setOriginalImage(image);

      // originalImageBitMap, setOriginalImageBitMap
    });

    image.src = png;

    window.addEventListener('resize', handleWindowResize);
  });

  onCleanup(() => {
    window.removeEventListener('resize', handleWindowResize);
  });

  // createEffect(on(activeTab, () => {
  // if(previewDimensions()) {
  // console.log('previewDimensions(): ', previewDimensions());
  // previewContentRef.style.width = `${previewDimensions().width}px`;
  // previewContentRef.style.height = `${previewDimensions().height}px`;
  // }
  // }));

  return (
    <div class={styles.MediaEditor}>

      <div style={{
        'position': 'absolute',
        'top': 0,
        'left': 0,
        'width': '200px',
        'background': 'rgba(255, 255, 255, 0.5)',
        'color': 'black',
        'font-size': '12px',
        'z-index': 1000,
        'pointer-events': 'none'
      }}>
        <p>Img natural h: {originalImage() && originalImage().naturalHeight}</p>
        <p>Img natural w: {originalImage() && originalImage().naturalWidth}</p>
        <p>_______</p>
        <p>P.Content h: {workareaDimensions() && Math.floor(workareaDimensions().height)}</p>
        <p>P.Content w: {workareaDimensions() && Math.floor(workareaDimensions().width)}</p>
        <p>______</p>
        <p>crop h: {state.crop.height}</p>
        <p>crop w: {state.crop.width}</p>
        <p>crop x: {state.crop.x}</p>
        <p>crop y: {state.crop.y}</p>
        <p>crop rotate: {state.crop.rotate}</p>
        <p>crop tilt: {state.crop.tilt}</p>
        <p>crop y: {state.crop.y}</p>
        <p>crop WA h: {state.crop.workareaHeight}</p>
        <p>crop WA w: {state.crop.workareaWidth}</p>
      </div>

      <div class={styles.MediaEditorContainer}>
        <div id="previewRef" class={styles.MediaEditorPreview} ref={previewRef}>
          <div class={styles.MediaEditorInnerPreview}>
            <div
              id="previewContentRef"
              style={{display: activeTab() === 'crop' ? 'none' : 'initial'}}
              class={styles.MediaEditorPreviewContent}
              ref={previewContentRef}
            >
              <For each={state.entities}>
                {(entity) => {
                  return (
                    <TransformableEntity
                      previewRef={previewContentRef}
                      id={entity.id}
                      x={entity.x}
                      y={entity.y}
                      width={entity.width}
                      height={entity.height}
                      isSelected={entity.id === state.selectedEntityId}
                      onMove={({x, y}) => {
                        if(entity.id !== state.selectedEntityId) {
                          selectEntity(entity.id);
                        }

                        setState('entities', entity.id, {x, y});
                      }}
                      controls={[
                        <ButtonIconTsx icon='delete_filled'  onClick={() => deleteTextEntity()} />
                      ]}
                    >
                      {isTextEntity(entity) ? (
                        <TextEntity {...entity} />
                      ) : (
                        <StickerEntity {...entity} />
                      )}
                    </TransformableEntity>
                  )
                }}
              </For>

              <canvas
                ref={drawingLayerCanvas}
                class={classNames(styles.MediaEditorPreviewLayer, styles.MediaEditorPreviewDrawingLayer)}
              />

              <canvas
                ref={filterLayerCanvas}
                class={classNames(styles.MediaEditorPreviewLayer, styles.MediaEditorPreviewFilterLayer)}
              />
            </div>
          </div>

          {activeTab() === 'crop' && (
            // <div id="previewContentRef" class={styles.MediaEditorCropContent} ref={previewContentRef}>
            <Crop
              state={state.crop}
              image={cropPreview()}
              onCropChange={onCropChange}
            />
            // </div>
          )}
        </div>

        <div class={styles.MediaEditorSidebar}>
          <div class={styles.MediaEditorSidebarHeader}>
            <div class={styles.MediaEditorSidebarHeaderCloseButton}>
              <ButtonIconTsx icon="close" class="sidebar-back-button" />
            </div>

            <div class={styles.MediaEditorSidebarHeaderTitle}>Edit</div>
          </div>

          <div class={styles.MediaEditorSidebarTabs}>
            <div class={styles.MediaEditorSidebarTabsList}>
              <ButtonIconTsx
                icon="enhance_media"
                noRipple={true}
                class={classNames(styles.MediaEditorSidebarTabsListTab, activeTab() === 'enhance' && styles.active)}
                onClick={() => handleTabClick('enhance')}
              />
              <ButtonIconTsx
                icon="crop"
                noRipple={true}
                class={classNames(styles.MediaEditorSidebarTabsListTab, activeTab() === 'crop' && styles.active)}
                onClick={handleCropTabToggle}
              />
              <ButtonIconTsx
                icon="text"
                noRipple={true}
                class={classNames(styles.MediaEditorSidebarTabsListTab, activeTab() === 'text' && styles.active)}
                onClick={() => handleTabClick('text')}
              />
              <ButtonIconTsx
                icon="brush"
                noRipple={true}
                class={classNames(styles.MediaEditorSidebarTabsListTab, activeTab() === 'brush' && styles.active)}
                onClick={() => handleTabClick('brush')}
              />
              <ButtonIconTsx
                icon="smile"
                noRipple={true}
                class={classNames(styles.MediaEditorSidebarTabsListTab, activeTab() === 'smile' && styles.active)}
                onClick={() => handleTabClick('smile')}
              />
            </div>

            <div class={styles.MediaEditorSidebarTabsContent}>
              {activeTab() === 'enhance' && (
                <div class={styles.MediaEditorSidebarTabsContentTabPanel}>
                  <div class={styles.MediaEditorSidebarTabsContentTabPanelFilter}>
                    <MediaEditorRangeSelector
                      label="Enhance"
                      min={0}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleEnhanceUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Brightness"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleBrigthnessUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Contrast"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleContrastUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Saturation"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleSaturationUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Warmth"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleWarmthUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Fade"
                      min={0}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleFadeUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Highlights"
                      min={0}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleHighlightsUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Shadows"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleShadowsUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Vignette"
                      min={0}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleVignetteUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Sharp"
                      min={0}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleSharpUpdate}
                    />
                    <MediaEditorRangeSelector
                      label="Grain"
                      min={0}
                      max={1}
                      step={0.01}
                      value={0}
                      onScrub={handleGrainUpdate}
                    />
                  </div>
                </div>
              )}

              {activeTab() === 'crop' && (
                <div class={styles.MediaEditorSidebarTabsContentTabPanel}>
                  <div class={styles.MediaEditorSidebarSectionHeader}>
                    Aspect ratio
                  </div>

                  {/* class={classNames(styles.MediaEditorSidebarTabsListTab, activeTab() === 'brush' && styles.active)} */}

                  <div class={styles.MediaEditorSidebarTabsContentTabPanelCrop}>
                    <RowTsx
                      title='Free'
                      icon='aspect_ratio_free'
                      clickable={() => setState('crop', {aspectRatio: 'Free'})}
                      rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === 'Free' && styles.Active]}
                    />

                    <RowTsx
                      title='Original'
                      icon='aspect_ratio_image_original'
                      clickable={() => setState('crop', {aspectRatio: 'Original'})}
                      rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === 'Original' && styles.Active]}
                    />

                    <RowTsx
                      title='Square'
                      icon='aspect_ratio_square'
                      clickable={() => setState('crop', {aspectRatio: 'Square'})}
                      rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === 'Square' && styles.Active]}
                    />

                    <div class={styles.MediaEditorSidebarTabsContentTabPanelCropRow}>
                      <RowTsx
                        title='3:2'
                        icon='aspect_ratio_3_2'
                        clickable={() => setState('crop', {aspectRatio: '3:2'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '3:2' && styles.Active]}
                      />

                      <RowTsx
                        title='2:3'
                        icon='aspect_ratio_3_2'
                        iconClasses={['row-icon-rotated']}
                        clickable={() => setState('crop', {aspectRatio: '2:3'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '2:3' && styles.Active]}
                      />
                    </div>

                    <div class={styles.MediaEditorSidebarTabsContentTabPanelCropRow}>
                      <RowTsx
                        title='4:3'
                        icon='aspect_ratio_4_3'
                        clickable={() => setState('crop', {aspectRatio: '4:3'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '4:3' && styles.Active]}
                      />

                      <RowTsx
                        title='3:4'
                        icon='aspect_ratio_4_3'
                        iconClasses={['row-icon-rotated']}
                        clickable={() => setState('crop', {aspectRatio: '3:4'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '3:4' && styles.Active]}
                      />
                    </div>

                    <div class={styles.MediaEditorSidebarTabsContentTabPanelCropRow}>
                      <RowTsx
                        title='5:4'
                        icon='aspect_ratio_5_4'
                        clickable={() => setState('crop', {aspectRatio: '5:4'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '5:4' && styles.Active]}
                      />

                      <RowTsx
                        title='4:5'
                        icon='aspect_ratio_5_4'
                        iconClasses={['row-icon-rotated']}
                        clickable={() => setState('crop', {aspectRatio: '4:5'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '4:5' && styles.Active]}
                      />
                    </div>

                    <div class={styles.MediaEditorSidebarTabsContentTabPanelCropRow}>
                      <RowTsx
                        title='7:5'
                        icon='aspect_ratio_7_5'
                        clickable={() => setState('crop', {aspectRatio: '7:5'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '7:5' && styles.Active]}
                      />

                      <RowTsx
                        title='5:7'
                        icon='aspect_ratio_7_5'
                        iconClasses={['row-icon-rotated']}
                        clickable={() => setState('crop', {aspectRatio: '5:7'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '5:7' && styles.Active]}
                      />
                    </div>

                    <div class={styles.MediaEditorSidebarTabsContentTabPanelCropRow}>
                      <RowTsx
                        title='16:9'
                        icon='aspect_ratio_16_9'
                        clickable={() => setState('crop', {aspectRatio: '16:9'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '16:9' && styles.Active]}
                      />

                      <RowTsx
                        title='9:16'
                        icon='aspect_ratio_16_9'
                        iconClasses={['row-icon-rotated']}
                        clickable={() => setState('crop', {aspectRatio: '9:16'})}
                        rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '9:16' && styles.Active]}
                      />
                    </div>

                    <RowTsx
                      title='DO CROP'
                      icon='bomb'
                      iconClasses={['row-icon-rotated']}
                      // clickable={() => setState('crop', {aspectRatio: '9:16'})}
                      rowClasses={[styles.MediaEditorRow, state.crop.aspectRatio === '9:16' && styles.Active]}
                      clickable={() => {
                        setActiveTab('enhance');
                        setTimeout(applyCrop);
                      }}
                    />
                  </div>
                </div>
              )}

              {activeTab() === 'text' && (
                <div class={styles.MediaEditorSidebarTabsContentTabPanel}>
                  <div class={styles.MediaEditorSidebarTabsContentTabPanelText}>
                    <div class={styles.MediaEditorSidebarTabsContentTabPanelTextRow}>
                      <MediaEditorColorPicker onChange={(color) => setTextEntityFontColor(color.rgba)} />
                    </div>

                    <div class={styles.MediaEditorSidebarTabsContentTabPanelTextRow}>
                      <div class={styles.MediaEditorSidebarTabsContentTabPanelTextCol}>
                        <ButtonIconTsx
                          icon="text_align_left"
                          class={classNames(styles.Button, (state.entities[state.selectedEntityId] as TextEntityType)?.textAlign === 'left' && styles.Active)}
                          onClick={() => {
                            setTextEntityTextAlign('left')
                          }}
                        />

                        <ButtonIconTsx
                          icon="text_align_centre"
                          class={classNames(styles.Button, (state.entities[state.selectedEntityId] as TextEntityType)?.textAlign === 'center' && styles.Active)}
                          onClick={() => {
                            setTextEntityTextAlign('center')
                          }}
                        />

                        <ButtonIconTsx
                          icon="text_align_right"
                          class={classNames(styles.Button, (state.entities[state.selectedEntityId] as TextEntityType)?.textAlign === 'right' && styles.Active)}
                          onClick={() => {
                            setTextEntityTextAlign('right')
                          }}
                        />
                      </div>

                      <div class={styles.MediaEditorSidebarTabsContentTabPanelTextCol}>
                        <ButtonIconTsx
                          icon="font_no_frame"
                          class={classNames(styles.Button, (state.entities[state.selectedEntityId] as TextEntityType)?.appearance === 'plain' && styles.Active)}
                          onClick={() => {
                            // setEntities((value) => {
                            //   return value.map((item, idx) => idx === selectedEntityId() ? {...item, appearance: 'plain'} : item);
                            // })
                          }}
                        />

                        <ButtonIconTsx
                          icon="font_black"
                          class={classNames(styles.Button, styles.ButtonMediumSize, (state.entities[state.selectedEntityId] as TextEntityType)?.appearance === 'border' && styles.Active)}
                          onClick={() => {
                            // setEntities((value) => {
                            // return value.map((item, idx) => idx === selectedEntityId() ? {...item, appearance: 'border'} : item);
                            // })
                          }}
                        />

                        <ButtonIconTsx
                          icon="font_white"
                          class={classNames(styles.Button, (state.entities[state.selectedEntityId] as TextEntityType)?.appearance === 'background' && styles.Active)}
                          onClick={() => {
                            // setEntities((value) => {
                            // return value.map((item, idx) => idx === selectedEntityId() ? {...item, appearance: 'background'} : item);
                            // })
                          }}
                        />
                      </div>
                    </div>

                    <MediaEditorRangeSelector
                      label="Size"
                      min={10}
                      max={64}
                      step={1}
                      value={16}
                      onScrub={(value) => setTextEntityFontSize(value)}
                    />

                    <div class={styles.MediaEditorSidebarSectionHeader}>
                      Controls
                    </div>

                    <RowTsx title='Add text' clickable={addTextEntity} />
                    <RowTsx title='Remove text' clickable={() => true} />
                    <RowTsx title='Render result' clickable={() => true} />

                    <div class={styles.MediaEditorSidebarSectionHeader}>
                      Font
                    </div>

                    <RowTsx title='Roboto' clickable={() => setTextEntityFont('Roboto')} rowClasses={[styles.MediaEditorFontRow, styles.MediaEditorFontRowRoboto]} />
                    <RowTsx title='Courier New' clickable={() => setTextEntityFont('Courier New')} rowClasses={[styles.MediaEditorFontRow, styles.MediaEditorFontRowCourierNew]} />
                    <RowTsx title='Georgia' clickable={() => setTextEntityFont('Georgia')} rowClasses={[styles.MediaEditorFontRow, styles.MediaEditorFontRowGeorgia]} />
                    <RowTsx title='Times New Roman' clickable={() => setTextEntityFont('Times New Roman')} rowClasses={[styles.MediaEditorFontRow, styles.MediaEditorFontRowTimesNewRoman]} />
                    <RowTsx title='Trebuchet MS' clickable={() => setTextEntityFont('Trebuchet MS')} rowClasses={[styles.MediaEditorFontRow, styles.MediaEditorFontRowTrebuchetMS]} />
                    <RowTsx title='Comic Sans' clickable={() => setTextEntityFont('Comic Sans MS')} rowClasses={[styles.MediaEditorFontRow, styles.MediaEditorFontRowComicSans]} />
                  </div>
                </div>
              )}

              {activeTab() === 'brush' && (
                <div class={styles.MediaEditorSidebarTabsContentTabPanel}>
                  <div class={styles.MediaEditorSidebarTabsContentTabPanelTextRow}>
                    <MediaEditorColorPicker onChange={(color) => setToolColor(color.rgba)} />
                  </div>

                  <MediaEditorRangeSelector
                    label="Size"
                    min={10}
                    max={48}
                    step={1}
                    value={14}
                    onScrub={(value) => setToolSize(value)}
                  />

                  <div class={styles.MediaEditorSidebarSectionHeader}>
                    Tool
                  </div>

                  <MediaEditorTool
                    title="Pen"
                    color={state.tools[0].color}
                    svg={<PenSvg />}
                    isSelected={state.selectedToolId === 0}
                    onClick={() => selectTool(0)}
                  />

                  <MediaEditorTool
                    title="Arrow"
                    color={state.tools[1].color}
                    svg={<ArrowSvg />}
                    isSelected={state.selectedToolId === 1}
                    onClick={() => selectTool(1)}
                  />

                  <MediaEditorTool
                    title="Brush"
                    color={state.tools[2].color}
                    svg={<BrushSvg />}
                    isSelected={state.selectedToolId === 2}
                    onClick={() => selectTool(2)}
                  />

                  <MediaEditorTool
                    title="Neon"
                    color={state.tools[3].color}
                    svg={<NeonBrushSvg />}
                    isSelected={state.selectedToolId === 3}
                    onClick={() => selectTool(3)}
                  />

                  <MediaEditorTool
                    title="Blur"
                    color={state.tools[4].color}
                    svg={<BlurSvg />}
                    isSelected={state.selectedToolId === 4}
                    onClick={() => selectTool(4)}
                  />

                  <MediaEditorTool
                    title="Eraser"
                    color={state.tools[5].color}
                    svg={<EraserSvg />}
                    isSelected={state.selectedToolId === 5}
                    onClick={() => selectTool(5)}
                  />
                </div>
              )}

              {activeTab() === 'smile' && (
                <div class={classNames(styles.MediaEditorSidebarTabsContentTabPanel, styles.Stickers)} ref={stickerTabRef}>
                  <h1>STICKERS</h1>
                  <button
                    style={{padding: '16px', background: 'blue'}}
                    // onClick={renderMedia}
                  >
                    RENDER IMAGE
                  </button>
                </div>
              )}
            </div>
          </div>

          <ButtonCornerTsx onClick={() => alert('click stuff')} />
        </div>
      </div>

      <div class={styles.MediaEditorBackground} />
    </div>
  );
};

export const createMediaEditor = () => {
  return (
    <Portal mount={document.getElementById('media-editor')}>
      <MediaEditor />
    </Portal>
  );
};

