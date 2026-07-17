/**
 * Retrieves the translation of text.
 *
 * @see https://developer.wordpress.org/block-editor/reference-guides/packages/packages-i18n/
 */
import { __, sprintf } from '@wordpress/i18n';

/**
 * React hook that is used to mark the block wrapper element.
 * It provides all the necessary props like the class name.
 *
 * @see https://developer.wordpress.org/block-editor/reference-guides/packages/packages-block-editor/#useblockprops
 */
import { InspectorControls, useBlockProps, InnerBlocks, store as blockEditorStore } from '@wordpress/block-editor';
import { PanelBody, Button, RangeControl, ToggleControl, SelectControl, ColorPicker, Dropdown, Tooltip } from '@wordpress/components';
import { __experimentalNumberControl as NumberControl,
	__experimentalHStack as HStack,
	__experimentalText as Text
} from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { useState, useEffect, useRef, useMemo } from '@wordpress/element';
import { Icon, plus, arrowLeft, arrowRight, copy, trash } from '@wordpress/icons';


/**
 * Lets webpack process CSS, SASS or SCSS files referenced in JavaScript files.
 * Those files can contain any CSS code that gets applied to the editor.
 *
 * @see https://www.npmjs.com/package/@wordpress/scripts#using-css
 */
import './scss/editor.scss';

// Effects that get a "stacked" single-slide crossfade, exactly like Swiper does on the front.
const FADE_EFFECTS = [ 'fade' ];
// Effects that keep the multi-slide layout but hint at a 3D transform on the slides
// that are not currently active. This is a simplified, CSS-only approximation of
// Swiper's coverflow/flip/cube/cards engines, not a pixel-perfect reproduction.
const DEPTH_EFFECTS = [ 'coverflow', 'flip', 'cube', 'cards' ];

/**
 * The edit function describes the structure of your block in the context of the
 * editor. This represents what the editor will render when the block is used.
 *
 * @see https://developer.wordpress.org/block-editor/reference-guides/block-api/block-edit-save/#edit
 *
 * @return {Element} Element to render.
 */
export default function Edit( { attributes, setAttributes, clientId } ) {
	const { slides, selectedClientId, selectedParents } = useSelect(
		( select ) => {
			const editorSelect = select( blockEditorStore );
			const selected = editorSelect.getSelectedBlockClientId();
			return {
				slides: editorSelect.getBlocks( clientId ),
				selectedClientId: selected,
				selectedParents: selected ? editorSelect.getBlockParents( selected, true ) : [],
			};
		},
		[ clientId ]
	);

	const { selectBlock, insertBlock, removeBlock, moveBlocksUp, moveBlocksDown } = useDispatch( blockEditorStore );
	const viewportRef = useRef( null );

	// If the current editor selection is a slide (or something inside a slide),
	// that slide becomes the active one, just like clicking through a real carousel.
	const selectedSlideId = useMemo( () => {
		if ( ! selectedClientId ) {
			return null;
		}
		const slideIds = slides.map( ( slide ) => slide.clientId );
		if ( slideIds.includes( selectedClientId ) ) {
			return selectedClientId;
		}
		return selectedParents.find( ( id ) => slideIds.includes( id ) ) || null;
	}, [ selectedClientId, selectedParents, slides ] );

	const [ activeSlideId, setActiveSlideId ] = useState( slides[ 0 ]?.clientId ?? null );
	const lastIndexRef = useRef( 0 );

	useEffect( () => {
		if ( selectedSlideId ) {
			setActiveSlideId( selectedSlideId );
		}
	}, [ selectedSlideId ] );

	const activeIndex = useMemo( () => {
		const ids = slides.map( ( slide ) => slide.clientId );
		let index = activeSlideId ? ids.indexOf( activeSlideId ) : -1;
		if ( index === -1 ) {
			index = Math.max( Math.min( lastIndexRef.current, ids.length - 1 ), 0 );
		}
		lastIndexRef.current = index;
		return index;
	}, [ slides, activeSlideId ] );

	const activeSlide = slides[ activeIndex ];
	const isFade = FADE_EFFECTS.includes( attributes.effect );
	const isDepthEffect = DEPTH_EFFECTS.includes( attributes.effect );
	let effectModifier = 'default';
	if ( isFade ) {
		effectModifier = 'fade';
	} else if ( isDepthEffect ) {
		effectModifier = 'depth';
	}

	// Keep the active slide scrolled into view (multi-slide "default"/depth layouts only;
	// fade is a stack, there is nothing to scroll).
	useEffect( () => {
		if ( isFade || ! activeSlide || ! viewportRef.current ) {
			return;
		}
		const slideEl = viewportRef.current.querySelector( `[data-block="${ activeSlide.clientId }"]` );
		if ( slideEl ) {
			slideEl.scrollIntoView( { behavior: 'smooth', inline: 'start', block: 'nearest' } );
		}
	}, [ activeSlide, isFade ] );

	const goToSlide = ( index ) => {
		const target = slides[ index ];
		if ( ! target ) {
			return;
		}
		setActiveSlideId( target.clientId );
		selectBlock( target.clientId );
	};

	const goPrev = () => goToSlide( ( activeIndex - 1 + slides.length ) % slides.length );
	const goNext = () => goToSlide( ( activeIndex + 1 ) % slides.length );

	const addSlide = ( afterIndex ) => {
		const newBlock = wp.blocks.createBlock( 'eo-blocks/slide' );
		insertBlock( newBlock, afterIndex + 1, clientId );
		setActiveSlideId( newBlock.clientId );
		selectBlock( newBlock.clientId );
	};

	const duplicateSlide = ( index ) => {
		const source = slides[ index ];
		if ( ! source ) {
			return;
		}
		const cloned = wp.blocks.cloneBlock( source );
		insertBlock( cloned, index + 1, clientId );
		setActiveSlideId( cloned.clientId );
		selectBlock( cloned.clientId );
	};

	const deleteSlide = ( index ) => {
		const target = slides[ index ];
		if ( ! target || slides.length <= 1 ) {
			return;
		}
		const fallback = slides[ index - 1 ] || slides[ index + 1 ];
		removeBlock( target.clientId, false );
		if ( fallback ) {
			setActiveSlideId( fallback.clientId );
		}
	};

	const moveSlideLeft = () => {
		if ( ! activeSlide || activeIndex <= 0 ) {
			return;
		}
		moveBlocksUp( [ activeSlide.clientId ], clientId );
	};

	const moveSlideRight = () => {
		if ( ! activeSlide || activeIndex >= slides.length - 1 ) {
			return;
		}
		moveBlocksDown( [ activeSlide.clientId ], clientId );
	};

	// Everything below only ever targets [data-type="eo-blocks/slide"], never a
	// depth-based ancestor selector, so blocks placed *inside* a slide (which carry a
	// different data-type) are never accidentally affected by this stylesheet.
	const scopeSelector = `[data-block="${ clientId }"] .eo-carousel-editor__track`;
	const blockSelector = `[data-block="${ clientId }"]`;
	const styleRules = [];

	// Custom properties live in this stylesheet (not as inline styles) on purpose:
	// inline styles always beat an @media rule's specificity, which would make the
	// mobile override below never actually apply.
	styleRules.push( `
		${ blockSelector } {
			--swiper-theme-color: ${ attributes.mainColor };
			--eo-carousel-spv: ${ attributes.slidesPerView || 1 };
			--eo-carousel-gap: ${ attributes.spaceBetween || 0 }px;
		}
	` );

	if ( isFade && activeSlide ) {
		styleRules.push(
			`${ scopeSelector } [data-type="eo-blocks/slide"]:not([data-block="${ activeSlide.clientId }"]) { display: none; }`
		);
	} else if ( isDepthEffect && activeSlide ) {
		styleRules.push(
			`${ scopeSelector } [data-type="eo-blocks/slide"]:not([data-block="${ activeSlide.clientId }"]) { transform: scale(0.92); filter: saturate(0.75) brightness(0.95); }`
		);
	}

	if ( attributes.mobileBreakpoint ) {
		styleRules.push( `
			@media (max-width: ${ attributes.mobileBreakpoint }px) {
				${ blockSelector } { --eo-carousel-spv: ${ attributes.mobileSlidesPerView || 1 }; }
			}
		` );
	}

	return (
		<>
			<InspectorControls>
				<PanelBody title={__('Carousel settings', 'eo-blocks')}>
					<RangeControl
						label={__('Slides to show', 'eo-blocks')}
						step={1}
						value={attributes.slidesPerView || 1}
						onChange={(value) => setAttributes({slidesPerView: value})}
						min={1}
						max={6}
					/>
					<RangeControl
						label={__('Slide animation speed (MS)', 'eo-blocks')}
						step={50}
						value={attributes.speed}
						onChange={(value) => setAttributes({speed: value})}
						min={0}
						max={3000}
					/>
					<div style={{
						fontSize: '11px',
						fontWeight: '500',
						lineHeight: '1.4',
						textTransform: 'uppercase',
						marginBottom: 8
					}}>{__('Main color', 'eo-blocks')}</div>
					<Dropdown
						style={{ marginBottom: 16 }}
						popoverProps={{placement: 'bottom-start'}}
						position="middle left"
						renderToggle={({isOpen, onToggle}) => (
							<Button
								variant="secondary"
								onClick={onToggle}
								aria-expanded={isOpen}
							>
								<HStack>
									<div style={{
										background: attributes.mainColor,
										width: 20,
										height: 20,
										borderRadius: '50%'
									}}></div>
									<Text>{__('Main color', 'eo-blocks')}</Text>
								</HStack>
							</Button>
						)}
						renderContent={() => (
							<ColorPicker
								color={attributes.mainColor}
								onChange={(value) => setAttributes({mainColor: value})}
								enableAlpha
								defaultValue="#000"
							/>
						)}
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						label={__('Prev/Next navigation', 'eo-blocks')}
						checked={attributes.navigation}
						onChange={(value) => setAttributes({navigation: value})}
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						label={__('Dots navigation', 'eo-blocks')}
						checked={attributes.pagination}
						onChange={(value) => setAttributes({pagination: value})}
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						label={__('Thumbs navigation', 'eo-blocks')}
						checked={attributes.thumbs}
						onChange={(value) => setAttributes({thumbs: value})}
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						label={__('Loop', 'eo-blocks')}
						checked={attributes.loop}
						onChange={(value) => setAttributes({loop: value})}
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						label={__('Autoplay', 'eo-blocks')}
						checked={attributes.autoplay}
						onChange={(value) => setAttributes({autoplay: value})}
					/>
					{attributes.autoplay && (
						<RangeControl
							label={__('Delay per slide (MS)', 'eo-blocks')}
							step={50}
							value={attributes.autoplayDelay}
							onChange={(value) => setAttributes({autoplayDelay: value})}
							min={0}
							max={1000}
						/>
					)}
					{attributes.autoplay && (
						<ToggleControl
							__nextHasNoMarginBottom
							label={__('Marquee mode', 'eo-blocks')}
							help={__( 'Scrolling without stop', 'eo-blocks' )}
							checked={attributes.marquee}
							onChange={(value) => setAttributes({marquee: value})}
						/>
					)}
					<SelectControl
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						label={__('Transition effect', 'eo-blocks')}
						value={attributes.effect}
						options={[
							{label: __('Default', 'eo-blocks'), value: 'default'},
							{label: __('Fade', 'eo-blocks'), value: 'fade'},
							{label: __('Coverflow', 'eo-blocks'), value: 'coverflow'},
							{label: __('Flip', 'eo-blocks'), value: 'flip'},
							{label: __('Cube', 'eo-blocks'), value: 'cube'},
							{label: __('Cards', 'eo-blocks'), value: 'cards'},
						]}
						onChange={(value) => setAttributes({effect: value})}
					/>
					<RangeControl
						label={__('Space between slides (px)', 'eo-blocks')}
						step={1}
						value={attributes.spaceBetween}
						onChange={(value) => setAttributes({spaceBetween: value})}
						min={0}
						max={100}
					/>
				</PanelBody>

				<PanelBody title={__('Mobile settings', 'eo-blocks')}>
					<NumberControl
						label={__('Mobile Breakpoint', 'eo-blocks')}
						help={__('Screen width (px)', 'eo-blocks')}
						value={attributes.mobileBreakpoint}
						onChange={(value) => setAttributes({mobileBreakpoint: value})}
					/>
					<RangeControl
						label={__('Slides to show', 'eo-blocks')}
						step={1}
						value={attributes.mobileSlidesPerView || 1}
						onChange={(value) => setAttributes({mobileSlidesPerView: value})}
						min={1}
						max={6}
					/>
				</PanelBody>
			</InspectorControls>

			<div
				{...useBlockProps({
					className: `eo-carousel-editor eo-carousel-editor--effect-${ effectModifier }`,
				})}
			>
				<style>{ styleRules.join( '\n' ) }</style>

				<div className="eo-carousel-editor__stage">
					<div className="eo-carousel-editor__viewport" ref={ viewportRef }>
						<div className="eo-carousel-editor__track">
							<InnerBlocks
								allowedBlocks={['eo-blocks/slide']}
								renderAppender={false}
							/>
						</div>
					</div>

					{ slides.length === 0 && (
						<div className="eo-carousel-editor__empty">
							<p>{ __( 'This carousel is empty.', 'eo-blocks' ) }</p>
							<Button variant="primary" onClick={ () => addSlide( -1 ) }>
								<Icon icon={ plus } />
								{ __( 'Add a new slide', 'eo-blocks' ) }
							</Button>
						</div>
					) }

					{ attributes.navigation && slides.length > 1 && (
						<>
							<button
								type="button"
								className="swiper-button-prev"
								aria-label={ __( 'Previous slide', 'eo-blocks' ) }
								onClick={ goPrev }
							/>
							<button
								type="button"
								className="swiper-button-next"
								aria-label={ __( 'Next slide', 'eo-blocks' ) }
								onClick={ goNext }
							/>
						</>
					) }

					{ attributes.pagination && slides.length > 0 && (
						<div className="swiper-pagination swiper-pagination-bullets">
							{ slides.map( ( slide, index ) => (
								<span
									key={ slide.clientId }
									role="button"
									tabIndex={ 0 }
									className={ 'swiper-pagination-bullet' + ( index === activeIndex ? ' swiper-pagination-bullet-active' : '' ) }
									onClick={ () => goToSlide( index ) }
									onKeyDown={ ( event ) => ( event.key === 'Enter' || event.key === ' ' ) && goToSlide( index ) }
									aria-label={
										/* translators: %d: slide number. */
										sprintf( __( 'Go to slide %d', 'eo-blocks' ), index + 1 )
									}
								/>
							) ) }
						</div>
					) }
				</div>

				{ attributes.thumbs && slides.length > 0 && (
					<div className="eo-carousel-editor__thumbs">
						{ slides.map( ( slide, index ) => (
							<button
								key={ slide.clientId }
								type="button"
								className={ 'eo-carousel-editor__thumb' + ( index === activeIndex ? ' is-active' : '' ) }
								onClick={ () => goToSlide( index ) }
							>
								{ index + 1 }
							</button>
						) ) }
					</div>
				) }

				{ slides.length > 0 && (
					<div className="eo-carousel-editor__toolbar">
						<div className="eo-carousel-editor__dots">
							{ slides.map( ( slide, index ) => (
								<Tooltip
									key={ slide.clientId }
									text={
										/* translators: %d: slide number. */
										sprintf( __( 'Slide %d', 'eo-blocks' ), index + 1 )
									}
								>
									<button
										type="button"
										className={ 'eo-carousel-editor__dot' + ( index === activeIndex ? ' is-active' : '' ) }
										onClick={ () => goToSlide( index ) }
									>
										<span className="screen-reader-text">
											{ /* translators: %d: slide number. */
											sprintf( __( 'Go to slide %d', 'eo-blocks' ), index + 1 ) }
										</span>
									</button>
								</Tooltip>
							) ) }
							<Tooltip text={ __( 'Add a new slide', 'eo-blocks' ) }>
								<button
									type="button"
									className="eo-carousel-editor__dot eo-carousel-editor__dot--add"
									onClick={ () => addSlide( slides.length - 1 ) }
								>
									<Icon icon={ plus } size={ 14 } />
									<span className="screen-reader-text">{ __( 'Add a new slide', 'eo-blocks' ) }</span>
								</button>
							</Tooltip>
						</div>

						<div className="eo-carousel-editor__actions">
							<span className="eo-carousel-editor__counter">
								{ /* translators: 1: current slide number, 2: total number of slides. */
								sprintf( __( 'Slide %1$d / %2$d', 'eo-blocks' ), activeIndex + 1, slides.length ) }
							</span>
							<Button
								icon={ arrowLeft }
								label={ __( 'Move slide left', 'eo-blocks' ) }
								onClick={ moveSlideLeft }
								disabled={ activeIndex <= 0 }
							/>
							<Button
								icon={ arrowRight }
								label={ __( 'Move slide right', 'eo-blocks' ) }
								onClick={ moveSlideRight }
								disabled={ activeIndex >= slides.length - 1 }
							/>
							<Button
								icon={ copy }
								label={ __( 'Duplicate slide', 'eo-blocks' ) }
								onClick={ () => duplicateSlide( activeIndex ) }
							/>
							<Button
								icon={ trash }
								label={ __( 'Delete slide', 'eo-blocks' ) }
								onClick={ () => deleteSlide( activeIndex ) }
								disabled={ slides.length <= 1 }
								isDestructive
							/>
						</div>
					</div>
				) }
			</div>
		</>
	);
}
